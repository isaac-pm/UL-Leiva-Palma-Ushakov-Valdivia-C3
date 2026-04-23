from sqlmodel import Session, select, func
from datetime import datetime, timedelta

from core.result import Result
from core.models import ActivityLogs


class ActivityService:

    @staticmethod
    def get_mode_distribution(session: Session) -> Result:
        try:
            stmt = (
                select(
                    ActivityLogs.currentMode,
                    func.count(ActivityLogs.id).label("count"),
                )
                .group_by(ActivityLogs.currentMode)
            )
            results = session.exec(stmt).all()
            data = [{"mode": row.currentMode, "count": row.count} for row in results]
            return Result.ok({"data": data})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_hourly_volume(session: Session, days: int = 7) -> Result:
        try:
            cutoff = datetime.now() - timedelta(days=days)
            stmt = (
                select(
                    func.date_trunc("hour", ActivityLogs.timestamp).label("hour"),
                    func.count(ActivityLogs.id).label("count"),
                )
                .where(ActivityLogs.timestamp >= cutoff)
                .group_by(func.date_trunc("hour", ActivityLogs.timestamp))
                .order_by("hour")
            )
            results = session.exec(stmt).all()
            data = [{"hour": row.hour, "count": row.count} for row in results]
            return Result.ok({"data": data, "days": days})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_location_counts(session: Session, limit: int = 20) -> Result:
        try:
            stmt = (
                select(
                    ActivityLogs.currentLocation,
                    func.count(ActivityLogs.id).label("count"),
                )
                .group_by(ActivityLogs.currentLocation)
                .order_by(func.count(ActivityLogs.id).desc())
                .limit(limit)
            )
            results = session.exec(stmt).all()
            data = [{"location": row.currentLocation, "count": row.count} for row in results]
            return Result.ok({"data": data, "limit": limit})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_count(session: Session) -> Result:
        try:
            stmt = select(func.count(ActivityLogs.id))
            count = session.exec(stmt).one()
            return Result.ok({"count": count})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)