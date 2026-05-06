from sqlmodel import Session, select, func

from core.result import Result
from core.models.base import Employers


class EmployerService:

    @staticmethod
    def get_count(session: Session) -> Result:
        try:
            stmt = select(func.count(Employers.employerId))
            count = session.exec(stmt).one()
            return Result.ok({"count": count})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def list_employers(
        session: Session,
        limit: int = 20,
        offset: int = 0,
    ) -> Result:
        try:
            stmt = (
                select(Employers)
                .order_by(Employers.employerId)
                .limit(limit)
                .offset(offset)
            )
            results = session.exec(stmt).all()
            data = [row.model_dump() for row in results]
            return Result.ok({"data": data, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, employer_id: int) -> Result:
        try:
            stmt = select(Employers).where(Employers.employerId == employer_id)
            result = session.exec(stmt).first()
            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: Employer {employer_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": result.model_dump()})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)