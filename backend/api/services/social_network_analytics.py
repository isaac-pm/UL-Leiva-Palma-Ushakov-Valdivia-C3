from datetime import date
from sqlmodel import Session, select
from sqlalchemy import delete

from core.result import Result

from core.models.analytics import AnalyticMacroEdges, AnalyticParticipantSnapshots,AnalyticSankeyFlows
from domain.social_network_clustering import SocialNetworkAnalyticsEngine
class VisualAnalyticsService:

    @staticmethod
    def compute_monthly_snapshot(session: Session, year: int, month: int) -> Result:
        """
        Calcula las métricas de red y flujos para un mes específico.
        Idealmente llamado mediante BackgroundTasks.
        """
        try:
            target_date = date(year, month, 1)
            
            # 1. Idempotencia: Limpiar datos previos de ese mes para evitar duplicados
            VisualAnalyticsService.delete_monthly_snapshot(session, year, month)

            # 2. Llamadas al motor de dominio (Stubs para las Tareas 1-3)
            engine = SocialNetworkAnalyticsEngine(session, target_date)
            engine.run_pipeline()
                        
            return Result.ok({"status": "computed", "timeWindow": target_date.isoformat()})
        except Exception as e:
            session.rollback()
            return Result.fail(f"500_INTERNAL: Error computing snapshot: {str(e)}", status_code=500)

    @staticmethod
    def delete_monthly_snapshot(session: Session, year: int, month: int) -> Result:
        """
        Limpia las tablas analíticas para un mes específico.
        """
        try:
            target_date = date(year, month, 1)
            
            session.exec(delete(AnalyticParticipantSnapshots).where(AnalyticParticipantSnapshots.timeWindow == target_date))
            session.exec(delete(AnalyticMacroEdges).where(AnalyticMacroEdges.timeWindow == target_date))
            session.exec(delete(AnalyticSankeyFlows).where(AnalyticSankeyFlows.timeWindow == target_date))
            session.commit()
            
            return Result.ok({"status": "deleted", "timeWindow": target_date.isoformat()})
        except Exception as e:
            session.rollback()
            return Result.fail(f"500_INTERNAL: Error deleting snapshot: {str(e)}", status_code=500)

    @staticmethod
    def get_macro_network(session: Session, year: int, month: int) -> Result:
        try:
            target_date = date(year, month, 1)
            stmt = select(AnalyticMacroEdges).where(AnalyticMacroEdges.timeWindow == target_date)
            results = session.exec(stmt).all()
            
            if not results:
                return Result.fail(
                    f"404_NOT_FOUND: No network data computed for {year}-{month}",
                    status_code=404,
                )
                
            data = [row.model_dump() for row in results]
            return Result.ok({"data": data, "year": year, "month": month})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_sankey_flows(session: Session, year: int, month: int) -> Result:
        try:
            target_date = date(year, month, 1)
            stmt = select(AnalyticSankeyFlows).where(AnalyticSankeyFlows.timeWindow == target_date)
            results = session.exec(stmt).all()
            
            if not results:
                return Result.fail(
                    f"404_NOT_FOUND: No Sankey data computed for {year}-{month}",
                    status_code=404,
                )
                
            data = [row.model_dump() for row in results]
            return Result.ok({"data": data, "year": year, "month": month})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)