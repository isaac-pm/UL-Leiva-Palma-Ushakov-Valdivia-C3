from sqlmodel import Session, select, func

from core.result import Result
from core.models import TravelJournal


class TravelService:

    @staticmethod
    def get_count(session: Session, participant_id: int = None) -> Result:
        try:
            stmt = select(func.count(TravelJournal.id))
            if participant_id is not None:
                stmt = stmt.where(TravelJournal.participantId == participant_id)
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
                    TravelJournal.id,
                    TravelJournal.participantId,
                    TravelJournal.travelStartTime,
                    TravelJournal.travelStartLocationId,
                    TravelJournal.travelEndTime,
                    TravelJournal.travelEndLocationId,
                    TravelJournal.purpose,
                    TravelJournal.checkInTime,
                    TravelJournal.checkOutTime,
                    TravelJournal.startingBalance,
                    TravelJournal.endingBalance,
                )
                .where(TravelJournal.participantId == participant_id)
                .order_by(TravelJournal.travelStartTime.desc())
                .limit(limit)
                .offset(offset)
            )
            results = session.exec(stmt).all()
            data = [dict(row) for row in results]
            return Result.ok({"data": data, "participant_id": participant_id, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, travel_id: str) -> Result:
        try:
            import uuid
            travel_uuid = uuid.UUID(travel_id)
            stmt = select(TravelJournal).where(TravelJournal.id == travel_uuid)
            result = session.exec(stmt).first()
            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: Travel record {travel_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": result.model_dump()})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)