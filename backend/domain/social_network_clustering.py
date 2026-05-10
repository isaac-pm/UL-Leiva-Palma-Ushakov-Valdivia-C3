
# /domain/visual_analytics_engine.py
import logging
import igraph as ig
from datetime import date
from dateutil.relativedelta import relativedelta
from sqlalchemy import text
from sqlmodel import Session

from core.models.analytics import (
    AnalyticParticipantSnapshots,
    AnalyticMacroEdges,
    AnalyticSankeyFlows
)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - [%(levelname)s] - %(message)s")
logger = logging.getLogger("Social Network Analytics")
class SocialNetworkAnalyticsEngine:
    """
    Core math and aggregation engine for visual analytics.
    Designed to run asynchronously and bypass ORM overhead for heavy computations.
    """
    def __init__(self, session: Session, target_date: date):
        self.session = session
        self.start_date = target_date
        # Advance exactly one month for strict time-window boundaries
        self.end_date = target_date + relativedelta(months=1)

    def run_pipeline(self):
        """Orchestrates the computation and bulk inserts the results."""
        # 1. Compute Network and Participant Metrics
        logger.info("[STAGE] 1 init clustering pipeline")
        participants_data, macro_edges_data = self._compute_network_metrics()
        
        # 2. Compute Sankey Flows
        logger.info("[STAGE] 2 Compute Sankey Flows")

        sankey_data = self._compute_sankey_flows()
        
        # 3. Bulk Insert (Bypassing session.add() loop for performance)
        
        logger.info("[STAGE]  Bulk Insert")
        
        # Note: participants_data is already inserted inside _compute_network_metrics
        # to enable the travel purpose JOIN query, so we skip STEP 1 here
        
        if macro_edges_data:
            logger.info(f"  [STEP 1] Bulk insert for MacroEdges: {len(macro_edges_data)}")
            self.session.bulk_insert_mappings(AnalyticMacroEdges, macro_edges_data)
        
        if sankey_data:
            logger.info(f"  [STEP 3] Bulk insert for sankey data: {len(sankey_data)}")
            self.session.bulk_insert_mappings(AnalyticSankeyFlows, sankey_data)
            
        self.session.commit()

    def _compute_network_metrics(self):
        """
        Extracts edges via raw SQL, runs Leiden & PageRank in C-core, 
        and calculates macro-edges between clusters.
        """
        # Step 1: Database-level Edge Collapse
     
        logger.info("   [STEP] 1 Database-level Edge Collapse") 


        edge_query = text("""
            SELECT "participantIdFrom" as source, "participantIdTo" as target, COUNT(id) as weight
            FROM social_network
            WHERE timestamp >= :start_date AND timestamp < :end_date
            GROUP BY "participantIdFrom", "participantIdTo"
        """)
        
        results = self.session.execute(edge_query, {
            "start_date": self.start_date, 
            "end_date": self.end_date
        }).fetchall()

        if not results:
            return [], []

        # Convert to tuple list for igraph: [(source, target, weight), ...]
        edges = [(row.source, row.target, row.weight) for row in results]

        # Step 2: C-Core Graph Computation
        logger.info("   [STEP] 2 C-Core Graph Computation") 
        # TupleList automatically handles non-sequential DB IDs by storing them in the "name" attribute
        g = ig.Graph.TupleList(edges, weights=True, directed=False)
        
        # Leiden Community Detection
        communities = g.community_leiden(objective_function="modularity", weights="weight")
        # PageRank Centrality
        pageranks = g.pagerank(weights="weight")

        # Step 3: Map results back to Participant IDs safely
        logger.info("   [STEP] 3 Map results back to Participant IDs safely") 
        participants_data = []
        cluster_membership = {}  # Needed to compute macro-edges later
        
        for v in g.vs:
            participant_id = v["name"]
            cluster_id = communities.membership[v.index]
            
            participants_data.append({
                "timeWindow": self.start_date,
                "participantId": participant_id,
                "clusterId": cluster_id,
                "pageRankScore": float(pageranks[v.index]),
                "startingBalance": 0.0, # Will be updated by Sankey phase or default
                "endingBalance": 0.0,
                "financialQuartile": 1  # Default, updated later
            })
            cluster_membership[participant_id] = cluster_id
    
        # Step 4: Compute Macro-Edges (Cluster-to-Cluster connections)
        logger.info("   [STEP] 4 Compute Macro-Edges (Cluster-to-Cluster connections)") 

        macro_edges_dict = {}
        for row in results:
            src_cluster = cluster_membership.get(row.source)
            tgt_cluster = cluster_membership.get(row.target)
            
            # Skip if we couldn't resolve a cluster (e.g., disconnected components)
            if src_cluster is None or tgt_cluster is None:
                continue
                
            # Create a deterministic key to prevent A->B and B->A duplication
            edge_key = tuple(sorted([src_cluster, tgt_cluster]))
            
            if edge_key not in macro_edges_dict:
                macro_edges_dict[edge_key] = {
                    "total": 0,
                    "commute": 0,
                    "recreation": 0,
                    "eating": 0,
                    "goingHome": 0,
                    "returningFromRestaurant": 0
                }
            macro_edges_dict[edge_key]["total"] += row.weight

        # Step 5: Compute travel purposes per cluster using direct SQL
        # This approach joins travel_journal with participant cluster assignments
        logger.info("   [STEP] 5 Compute travel purposes per cluster via SQL")
        
        # First, insert participant snapshots (needed for the JOIN)
        if participants_data:
            self.session.bulk_insert_mappings(AnalyticParticipantSnapshots, participants_data)
            self.session.flush()  # Flush to ensure data is available for the JOIN
        
        # Direct SQL to get travel purposes grouped by cluster
        # This joins travel_journal with the just-inserted participant snapshots
        travel_cluster_query = text("""
            WITH cluster_mapping AS (
                SELECT "participantId", "clusterId"
                FROM analytic_participant_snapshots
                WHERE "timeWindow" = :time_window
            )
            SELECT 
                cm."clusterId",
                tj.purpose,
                COUNT(*) as travel_count
            FROM travel_journal tj
            INNER JOIN cluster_mapping cm ON tj."participantId" = cm."participantId"
            WHERE tj."travelStartTime" >= :start_date AND tj."travelStartTime" < :end_date
            GROUP BY cm."clusterId", tj.purpose
            ORDER BY cm."clusterId", tj.purpose
        """)
        
        travel_cluster_results = self.session.execute(travel_cluster_query, {
            "time_window": self.start_date,
            "start_date": self.start_date, 
            "end_date": self.end_date
        }).fetchall()
        
        logger.info(f"   [INFO] Found {len(travel_cluster_results)} cluster-purpose records")
        
        # Build cluster_purposes from direct SQL results
        cluster_purposes = {}
        for row in travel_cluster_results:
            cluster_id = row.clusterId
            purpose = row.purpose
            count = row.travel_count
            
            if cluster_id not in cluster_purposes:
                cluster_purposes[cluster_id] = {}
            cluster_purposes[cluster_id][purpose] = count
        
        logger.info(f"   [INFO] Cluster purposes populated for {len(cluster_purposes)} clusters")
        
        # Add travel purposes to macro_edges based on BOTH source AND target clusters
        for edge_key, edge_data in macro_edges_dict.items():
            src_cluster = edge_key[0]
            tgt_cluster = edge_key[1]
            
            src_purposes = cluster_purposes.get(src_cluster, {})
            tgt_purposes = cluster_purposes.get(tgt_cluster, {})
            
            edge_data["commute"] = src_purposes.get("WORK_HOME_COMMUTE", 0) + tgt_purposes.get("WORK_HOME_COMMUTE", 0)
            edge_data["recreation"] = src_purposes.get("RECREATION", 0) + tgt_purposes.get("RECREATION", 0)
            edge_data["eating"] = src_purposes.get("EATING", 0) + tgt_purposes.get("EATING", 0)
            edge_data["goingHome"] = src_purposes.get("GOING_BACK_TO_HOME", 0) + tgt_purposes.get("GOING_BACK_TO_HOME", 0)
            edge_data["returningFromRestaurant"] = src_purposes.get("COMING_BACK_FROM_RESTAURANT", 0) + tgt_purposes.get("COMING_BACK_FROM_RESTAURANT", 0)

        macro_edges_data = [
            {
                "timeWindow": self.start_date,
                "sourceClusterId": key[0],
                "targetClusterId": key[1],
                "interactionCount": data["total"],
                "commuteInteractions": data["commute"],
                "recreationInteractions": data["recreation"],
                "eatingInteractions": data["eating"],
                "goingHomeInteractions": data["goingHome"],
                "returningFromRestaurantInteractions": data["returningFromRestaurant"]
            }
            for key, data in macro_edges_dict.items()
        ]

        return participants_data, macro_edges_data

    def _compute_sankey_flows(self):
        """
        Uses PostgreSQL CTEs and Window Functions to compute financial paths without 
        loading millions of individual records into Python memory.
        """
        sankey_query = text("""
            WITH participant_financials AS (
                -- 1. Get the aggregate start/end balance for the month per participant
                SELECT 
                    "participantId",
                    SUM("startingBalance") as total_start,
                    SUM("endingBalance") as total_end
                FROM travel_journal
                WHERE "travelStartTime" >= :start_date AND "travelStartTime" < :end_date
                GROUP BY "participantId"
            ),
            quartiles AS (
                -- 2. Rank participants into 4 wealth brackets based on their start balance
                SELECT 
                    "participantId",
                    NTILE(4) OVER (ORDER BY total_start) as wealth_bracket
                FROM participant_financials
            )
            -- 3. Group the raw travels by bracket and purpose to create Sankey paths
            SELECT 
                q.wealth_bracket as source_quartile,
                tj.purpose as travel_purpose,
                -- In a real scenario, target quartile might differ if wealth changed drastically, 
                -- but for simplicity of the visual flow, we route back to the cohort's bracket
                q.wealth_bracket as target_quartile, 
                SUM(tj."startingBalance") as path_start_balance,
                SUM(tj."endingBalance") as path_end_balance,
                COUNT(DISTINCT tj."participantId") as people_count
            FROM travel_journal tj
            JOIN quartiles q ON tj."participantId" = q."participantId"
            WHERE tj."travelStartTime" >= :start_date AND tj."travelStartTime" < :end_date
            GROUP BY q.wealth_bracket, tj.purpose
        """)
        logger.info("[STAGE] 1 Querying the database")
        results = self.session.execute(sankey_query, {
            "start_date": self.start_date, 
            "end_date": self.end_date
        }).fetchall()

        logger.info("[STAGE] 2 Parsing results")
        sankey_data = [
            {
                "timeWindow": self.start_date,
                "sourceFinancialQuartile": row.source_quartile,
                "travelPurpose": row.travel_purpose,
                "targetFinancialQuartile": row.target_quartile,
                "totalStartingBalance": float(row.path_start_balance),
                "totalEndingBalance": float(row.path_end_balance),
                "participantCount": row.people_count
            }
            for row in results
        ]

        return sankey_data