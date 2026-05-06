# /domain/visual_analytics_engine.py
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
        participants_data, macro_edges_data = self._compute_network_metrics()
        
        # 2. Compute Sankey Flows
        sankey_data = self._compute_sankey_flows()
        
        # 3. Bulk Insert (Bypassing session.add() loop for performance)
        if participants_data:
            self.session.bulk_insert_mappings(AnalyticParticipantSnapshots, participants_data)
        if macro_edges_data:
            self.session.bulk_insert_mappings(AnalyticMacroEdges, macro_edges_data)
        if sankey_data:
            self.session.bulk_insert_mappings(AnalyticSankeyFlows, sankey_data)
            
        self.session.commit()

    def _compute_network_metrics(self):
        """
        Extracts edges via raw SQL, runs Leiden & PageRank in C-core, 
        and calculates macro-edges between clusters.
        """
        # Step 1: Database-level Edge Collapse
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
        # TupleList automatically handles non-sequential DB IDs by storing them in the "name" attribute
        g = ig.Graph.TupleList(edges, weights=True, directed=False)
        
        # Leiden Community Detection
        communities = g.community_leiden(objective_function="modularity", weights="weight")
        # PageRank Centrality
        pageranks = g.pagerank(weights="weight")

        # Step 3: Map results back to Participant IDs safely
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
                macro_edges_dict[edge_key] = 0
            macro_edges_dict[edge_key] += row.weight

        macro_edges_data = [
            {
                "timeWindow": self.start_date,
                "sourceClusterId": key[0],
                "targetClusterId": key[1],
                "interactionCount": weight
            }
            for key, weight in macro_edges_dict.items()
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

        results = self.session.execute(sankey_query, {
            "start_date": self.start_date, 
            "end_date": self.end_date
        }).fetchall()

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