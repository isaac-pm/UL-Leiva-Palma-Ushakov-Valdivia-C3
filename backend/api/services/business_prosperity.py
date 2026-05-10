from typing import Optional, List

from sqlalchemy import text
from sqlmodel import Session

from core.result import Result
from api.services.employers import EmployerService


class BusinessProsperityService:
    DISPLAY_TYPES = {
        "RESTAURANT": "Restaurant",
        "PUB": "Pub",
        "Restaurant": "Restaurant",
        "Pub": "Pub",
    }

    DB_TYPES = {
        "Restaurant": "RESTAURANT",
        "Pub": "PUB",
        "RESTAURANT": "RESTAURANT",
        "PUB": "PUB",
    }

    @staticmethod
    def _parse_location(wkt: Optional[str]) -> Optional[List[float]]:
        point = EmployerService.parse_wkt_point(wkt)
        if point is not None:
            return point

        if not wkt:
            return None

        parts = wkt.strip().split()
        if len(parts) != 2:
            return None

        try:
            return [float(parts[0]), float(parts[1])]
        except ValueError:
            return None

    @staticmethod
    def get_summary(session: Session) -> Result:
        try:
            query = text("""
                WITH businesses AS (
                    SELECT
                        "restaurantId" AS business_id,
                        'RESTAURANT' AS business_type,
                        "foodCost" AS listed_cost,
                        "maxOccupancy" AS max_occupancy,
                        location,
                        "buildingId" AS building_id
                    FROM restaurants
                    UNION ALL
                    SELECT
                        "pubId" AS business_id,
                        'PUB' AS business_type,
                        "hourlyCost" AS listed_cost,
                        "maxOccupancy" AS max_occupancy,
                        location,
                        "buildingId" AS building_id
                    FROM pubs
                ),
                bounds AS (
                    SELECT
                        MIN(timestamp) AS min_time,
                        MIN(timestamp) + ((MAX(timestamp) - MIN(timestamp)) / 2) AS mid_time
                    FROM checkin_journal
                    WHERE "venueType" IN ('RESTAURANT', 'PUB')
                ),
                visit_summary AS (
                    SELECT
                        "venueId" AS business_id,
                        "venueType"::text AS business_type,
                        COUNT(*) AS visit_count,
                        COUNT(DISTINCT "participantId") AS unique_customers,
                        SUM(CASE WHEN timestamp < (SELECT mid_time FROM bounds) THEN 1 ELSE 0 END) AS early_visits,
                        SUM(CASE WHEN timestamp >= (SELECT mid_time FROM bounds) THEN 1 ELSE 0 END) AS late_visits
                    FROM checkin_journal
                    WHERE "venueType" IN ('RESTAURANT', 'PUB')
                    GROUP BY "venueId", "venueType"
                )
                SELECT
                    b.business_id,
                    b.business_type,
                    b.listed_cost,
                    b.max_occupancy,
                    b.location,
                    b.building_id,
                    COALESCE(v.visit_count, 0) AS visit_count,
                    COALESCE(v.unique_customers, 0) AS unique_customers,
                    COALESCE(v.early_visits, 0) AS early_visits,
                    COALESCE(v.late_visits, 0) AS late_visits,
                    COALESCE(v.visit_count, 0) * COALESCE(b.listed_cost, 0) AS estimated_revenue
                FROM businesses b
                LEFT JOIN visit_summary v
                    ON v.business_id = b.business_id
                    AND v.business_type = b.business_type
                ORDER BY estimated_revenue DESC, visit_count DESC
            """)

            rows = session.execute(query).fetchall()
            data = []
            max_revenue = max((float(row.estimated_revenue or 0) for row in rows), default=1.0) or 1.0
            max_visits = max((int(row.visit_count or 0) for row in rows), default=1) or 1
            max_customers = max((int(row.unique_customers or 0) for row in rows), default=1) or 1

            for row in rows:
                visit_count = int(row.visit_count or 0)
                unique_customers = int(row.unique_customers or 0)
                estimated_revenue = float(row.estimated_revenue or 0)
                early_visits = int(row.early_visits or 0)
                late_visits = int(row.late_visits or 0)
                trend_delta = late_visits - early_visits

                prosperity_score = (
                    0.5 * (estimated_revenue / max_revenue)
                    + 0.3 * (visit_count / max_visits)
                    + 0.2 * (unique_customers / max_customers)
                )

                data.append({
                    "businessId": row.business_id,
                    "businessType": BusinessProsperityService.DISPLAY_TYPES.get(
                        row.business_type,
                        row.business_type,
                    ),
                    "listedCost": float(row.listed_cost or 0),
                    "maxOccupancy": int(row.max_occupancy or 0),
                    "buildingId": row.building_id,
                    "location": BusinessProsperityService._parse_location(row.location),
                    "visitCount": visit_count,
                    "uniqueCustomers": unique_customers,
                    "earlyVisits": early_visits,
                    "lateVisits": late_visits,
                    "trendDelta": trend_delta,
                    "estimatedRevenue": estimated_revenue,
                    "avgRevenuePerCustomer": (
                        estimated_revenue / unique_customers
                        if unique_customers > 0
                        else 0
                    ),
                    "prosperityScore": round(prosperity_score, 4),
                })

            return Result.ok({"data": data})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_timeseries(session: Session, business_type: str, business_id: int) -> Result:
        try:
            db_business_type = BusinessProsperityService.DB_TYPES.get(business_type)
            if db_business_type is None:
                return Result.fail(
                    "400_BAD_REQUEST: business_type must be Restaurant or Pub",
                    status_code=400,
                )

            cost_query = text("""
                SELECT "foodCost" AS listed_cost
                FROM restaurants
                WHERE :business_type = 'RESTAURANT' AND "restaurantId" = :business_id
                UNION ALL
                SELECT "hourlyCost" AS listed_cost
                FROM pubs
                WHERE :business_type = 'PUB' AND "pubId" = :business_id
            """)
            cost_row = session.execute(
                cost_query,
                {"business_type": db_business_type, "business_id": business_id},
            ).fetchone()
            listed_cost = float(cost_row.listed_cost or 0) if cost_row else 0

            query = text("""
                SELECT
                    date_trunc('month', timestamp)::date AS month,
                    COUNT(*) AS visit_count,
                    COUNT(DISTINCT "participantId") AS unique_customers
                FROM checkin_journal
                WHERE "venueType" = :business_type
                    AND "venueId" = :business_id
                GROUP BY date_trunc('month', timestamp)::date
                ORDER BY month
            """)

            rows = session.execute(
                query,
                {"business_type": db_business_type, "business_id": business_id},
            ).fetchall()

            data = [
                {
                    "month": row.month.isoformat(),
                    "visitCount": int(row.visit_count or 0),
                    "uniqueCustomers": int(row.unique_customers or 0),
                    "estimatedRevenue": float(row.visit_count or 0) * listed_cost,
                }
                for row in rows
            ]

            return Result.ok({
                "businessId": business_id,
                "businessType": business_type,
                "listedCost": listed_cost,
                "data": data,
            })
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)
