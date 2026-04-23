from sqlmodel import Session, select, func

from core.result import Result
from core.models import Jobs


class JobService:

    @staticmethod
    def get_count(session: Session) -> Result:
        try:
            stmt = select(func.count(Jobs.jobId))
            count = session.exec(stmt).one()
            return Result.ok({"count": count})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def list_jobs(
        session: Session,
        limit: int = 20,
        offset: int = 0,
    ) -> Result:
        try:
            stmt = (
                select(
                    Jobs.jobId,
                    Jobs.employerId,
                    Jobs.hourlyRate,
                    Jobs.startTime,
                    Jobs.endTime,
                    Jobs.educationRequirement,
                )
                .order_by(Jobs.jobId)
                .limit(limit)
                .offset(offset)
            )
            results = session.exec(stmt).all()
            data = [dict(row) for row in results]
            return Result.ok({"data": data, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, job_id: int) -> Result:
        try:
            stmt = select(Jobs).where(Jobs.jobId == job_id)
            result = session.exec(stmt).first()
            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: Job {job_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": result.model_dump()})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)