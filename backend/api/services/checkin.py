from sqlmodel import Session, select, func

from core.result import Result
from core.models import CheckinJournal


class CheckinService:

    @staticmethod
    def get_count(session: Session, participant_id: int = None) -> Result:
        try:
            stmt = select(func.count(CheckinJournal.id))
            if participant_id is not None:
                stmt = stmt.where(CheckinJournal.participantId == participant_id)
            count = session.exec(stmt).one()
            return Result.ok({"count": count})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def list_by_participant(
        session: Session,
        participant_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> Result:
        try:
            stmt = (
                select(
                    CheckinJournal.id,
                    CheckinJournal.participantId,
                    CheckinJournal.timestamp,
                    CheckinJournal.venueId,
                    CheckinJournal.venueType,
                )
                .where(CheckinJournal.participantId == participant_id)
                .order_by(CheckinJournal.timestamp.desc())
                .limit(limit)
                .offset(offset)
            )
            results = session.exec(stmt).all()
            data = [row._mapping for row in results]
            return Result.ok({"data": data, "participant_id": participant_id, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, checkin_id: str) -> Result:
        try:
            import uuid
            checkin_uuid = uuid.UUID(checkin_id)
            stmt = select(CheckinJournal).where(CheckinJournal.id == checkin_uuid)
            result = session.exec(stmt).first()
            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: Checkin {checkin_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": result.model_dump()})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)