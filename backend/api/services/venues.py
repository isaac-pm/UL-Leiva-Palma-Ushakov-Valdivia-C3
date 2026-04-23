from sqlmodel import Session, select, func

from core.result import Result
from core.models import Pubs, Restaurants, Schools


class VenueService:

    @staticmethod
    def get_count(session: Session, venue_type: str = "pub") -> Result:
        try:
            if venue_type == "pub":
                stmt = select(func.count(Pubs.pubId))
            elif venue_type == "restaurant":
                stmt = select(func.count(Restaurants.restaurantId))
            elif venue_type == "school":
                stmt = select(func.count(Schools.schoolId))
            else:
                return Result.fail(
                    f"400_BAD_REQUEST: Invalid venue_type '{venue_type}'. Use 'pub', 'restaurant', or 'school'.",
                    status_code=400,
                )
            count = session.exec(stmt).one()
            return Result.ok({"count": count, "venue_type": venue_type})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def list_venues(
        session: Session,
        venue_type: str = "pub",
        limit: int = 20,
        offset: int = 0,
    ) -> Result:
        try:
            if venue_type == "pub":
                stmt = (
                    select(
                        Pubs.pubId.label("venueId"),
                        Pubs.location,
                        Pubs.hourlyCost,
                        Pubs.maxOccupancy,
                        Pubs.buildingId,
                    )
                    .order_by(Pubs.pubId)
                    .limit(limit)
                    .offset(offset)
                )
            elif venue_type == "restaurant":
                stmt = (
                    select(
                        Restaurants.restaurantId.label("venueId"),
                        Restaurants.location,
                        Restaurants.foodCost,
                        Restaurants.maxOccupancy,
                        Restaurants.buildingId,
                    )
                    .order_by(Restaurants.restaurantId)
                    .limit(limit)
                    .offset(offset)
                )
            elif venue_type == "school":
                stmt = (
                    select(
                        Schools.schoolId.label("venueId"),
                        Schools.location,
                        Schools.monthlyFees,
                        Schools.maxEnrollment,
                        Schools.buildingId,
                    )
                    .order_by(Schools.schoolId)
                    .limit(limit)
                    .offset(offset)
                )
            else:
                return Result.fail(
                    f"400_BAD_REQUEST: Invalid venue_type '{venue_type}'. Use 'pub', 'restaurant', or 'school'.",
                    status_code=400,
                )
            results = session.exec(stmt).all()
            data = [dict(row._mapping, venue_type=venue_type) for row in results]
            return Result.ok({"data": data, "venue_type": venue_type, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, venue_id: int, venue_type: str = "pub") -> Result:
        try:
            if venue_type == "pub":
                stmt = select(Pubs).where(Pubs.pubId == venue_id)
                result = session.exec(stmt).first()
                if result:
                    data = result.model_dump()
                    data["venueId"] = data.pop("pubId")
                else:
                    result = None
            elif venue_type == "restaurant":
                stmt = select(Restaurants).where(Restaurants.restaurantId == venue_id)
                result = session.exec(stmt).first()
                if result:
                    data = result.model_dump()
                    data["venueId"] = data.pop("restaurantId")
                else:
                    result = None
            elif venue_type == "school":
                stmt = select(Schools).where(Schools.schoolId == venue_id)
                result = session.exec(stmt).first()
                if result:
                    data = result.model_dump()
                    data["venueId"] = data.pop("schoolId")
                else:
                    result = None
            else:
                return Result.fail(
                    f"400_BAD_REQUEST: Invalid venue_type '{venue_type}'. Use 'pub', 'restaurant', or 'school'.",
                    status_code=400,
                )

            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: {venue_type.title()} {venue_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": data, "venue_type": venue_type})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)