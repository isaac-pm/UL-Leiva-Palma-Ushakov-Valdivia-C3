from sqlmodel import Session, select, func

from core.result import Result
from core.models import SocialNetwork


class SocialService:

    @staticmethod
    def get_count(session: Session, participant_id: int = None) -> Result:
        try:
            if participant_id is not None:
                stmt = select(func.count(SocialNetwork.id)).where(
                    (SocialNetwork.participantIdFrom == participant_id) |
                    (SocialNetwork.participantIdTo == participant_id)
                )
            else:
                stmt = select(func.count(SocialNetwork.id))
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
                    SocialNetwork.id,
                    SocialNetwork.participantIdFrom,
                    SocialNetwork.participantIdTo,
                    SocialNetwork.timestamp,
                )
                .where(
                    (SocialNetwork.participantIdFrom == participant_id) |
                    (SocialNetwork.participantIdTo == participant_id)
                )
                .order_by(SocialNetwork.timestamp.desc())
                .limit(limit)
                .offset(offset)
            )
            results = session.exec(stmt).all()
            data = [dict(row) for row in results]
            return Result.ok({"data": data, "participant_id": participant_id, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, social_id: str) -> Result:
        try:
            import uuid
            social_uuid = uuid.UUID(social_id)
            stmt = select(SocialNetwork).where(SocialNetwork.id == social_uuid)
            result = session.exec(stmt).first()
            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: Social record {social_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": result.model_dump()})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)