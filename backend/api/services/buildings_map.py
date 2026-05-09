import re
from typing import List

from sqlmodel import Session, select, func
from sqlalchemy import distinct

from core.result import Result
from core.models.base import Buildings, Apartments, Pubs, Restaurants, Schools, Employers


def parse_wkt_polygon(wkt: str) -> List[List[List[float]]]:
    if not wkt:
        return []

    text = wkt.strip()
    if not text:
        return []

    if not text.upper().startswith("POLYGON"):
        return []

    ring_texts = re.findall(r"\(([^()]+)\)", text)
    rings: List[List[List[float]]] = []

    for ring_text in ring_texts:
        points: List[List[float]] = []
        for pair in ring_text.split(","):
            coords = pair.strip().split()
            if len(coords) < 2:
                continue
            try:
                x = float(coords[0])
                y = float(coords[1])
            except ValueError:
                continue
            points.append([x, y])

        if points:
            rings.append(points)

    return rings


class BuildingMapService:

    @staticmethod
    def list_building_polygons(
        session: Session,
        limit: int = 5000,
        offset: int = 0,
    ) -> Result:
        try:
            stmt = (
                select(
                    Buildings.buildingId,
                    Buildings.location,
                    Buildings.buildingType,
                    func.count(distinct(Apartments.apartmentId)).label("apt_count"),
                    func.count(distinct(Pubs.pubId)).label("pub_count"),
                    func.count(distinct(Restaurants.restaurantId)).label("rest_count"),
                    func.count(distinct(Schools.schoolId)).label("school_count"),
                    func.count(distinct(Employers.employerId)).label("emp_count"),
                )
                .select_from(Buildings)
                .outerjoin(Apartments, Apartments.buildingId == Buildings.buildingId)
                .outerjoin(Pubs, Pubs.buildingId == Buildings.buildingId)
                .outerjoin(Restaurants, Restaurants.buildingId == Buildings.buildingId)
                .outerjoin(Schools, Schools.buildingId == Buildings.buildingId)
                .outerjoin(Employers, Employers.buildingId == Buildings.buildingId)
                .group_by(Buildings.buildingId, Buildings.location, Buildings.buildingType)
                .order_by(Buildings.buildingId)
                .limit(limit)
                .offset(offset)
            )
            rows = session.exec(stmt).all()

            data = []
            for row in rows:
                (
                    building_id, location, building_type,
                    apt_count, pub_count, rest_count, school_count, emp_count,
                ) = row

                rings = parse_wkt_polygon(location)
                if not rings:
                    continue

                if apt_count > 0:
                    derived_type = "Apartment"
                elif pub_count > 0:
                    derived_type = "Pub"
                elif rest_count > 0:
                    derived_type = "Restaurant"
                elif school_count > 0:
                    derived_type = "School"
                elif emp_count > 0:
                    derived_type = "Employer"
                else:
                    derived_type = (
                        building_type.value
                        if hasattr(building_type, "value")
                        else building_type
                    ) or "Unknown"

                data.append({
                    "id": building_id,
                    "type": derived_type,
                    "rings": rings,
                })

            return Result.ok({"data": data, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)
