import re
from typing import List

from sqlmodel import Session, select

from core.result import Result
from core.models.base import Buildings


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
                )
                .order_by(Buildings.buildingId)
                .limit(limit)
                .offset(offset)
            )
            rows = session.exec(stmt).all()

            data = []
            for building_id, location, building_type in rows:
                rings = parse_wkt_polygon(location)
                if not rings:
                    continue

                building_type_value = (
                    building_type.value
                    if hasattr(building_type, "value")
                    else building_type
                )

                data.append({
                    "id": building_id,
                    "type": building_type_value,
                    "rings": rings,
                })

            return Result.ok({"data": data, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)
