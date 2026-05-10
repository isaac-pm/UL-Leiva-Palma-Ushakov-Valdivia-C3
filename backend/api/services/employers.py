import math
import re
from typing import List, Optional

from sqlmodel import Session, select, func
from sqlalchemy import case, distinct

from core.result import Result
from core.models.base import Employers, Jobs, Buildings, ActivityLogs


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

    @staticmethod
    def parse_wkt_point(wkt: Optional[str]) -> Optional[List[float]]:
        if not wkt:
            return None

        text_value = wkt.strip()
        if not text_value.upper().startswith("POINT"):
            return None

        match = re.search(r"POINT\s*\(\s*([\-\d\.]+)\s+([\-\d\.]+)\s*\)", text_value, re.IGNORECASE)
        if not match:
            return None

        try:
            return [float(match.group(1)), float(match.group(2))]
        except ValueError:
            return None

    @staticmethod
    def parse_wkt_polygon(wkt: Optional[str]) -> List[List[List[float]]]:
        if not wkt:
            return []

        text_value = wkt.strip()
        if not text_value or not text_value.upper().startswith("POLYGON"):
            return []

        ring_texts = re.findall(r"\(([^()]+)\)", text_value)
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

    @staticmethod
    def polygon_centroid(rings: List[List[List[float]]]) -> Optional[List[float]]:
        if not rings or not rings[0] or len(rings[0]) < 3:
            return None

        ring = rings[0]
        area = 0.0
        cx = 0.0
        cy = 0.0

        for idx in range(len(ring)):
            x1, y1 = ring[idx]
            x2, y2 = ring[(idx + 1) % len(ring)]
            cross = x1 * y2 - x2 * y1
            area += cross
            cx += (x1 + x2) * cross
            cy += (y1 + y2) * cross

        if abs(area) < 1e-9:
            return None

        area *= 0.5
        cx /= (6.0 * area)
        cy /= (6.0 * area)
        if not math.isfinite(cx) or not math.isfinite(cy):
            return None
        return [cx, cy]

    @staticmethod
    def get_map_data(session: Session) -> Result:
        try:
            shift_duration = (
                func.extract("epoch", Jobs.endTime)
                - func.extract("epoch", Jobs.startTime)
            ) / 3600.0

            shift_hours_avg = case(
                (func.count(Jobs.jobId) > 0, func.avg(shift_duration)),
                else_=None,
            )

            stmt = (
                select(
                    Employers.employerId,
                    Employers.location,
                    Employers.buildingId,
                    Buildings.location.label("buildingLocation"),
                    func.count(Jobs.jobId).label("jobCount"),
                    func.avg(Jobs.hourlyRate).label("avgHourlyRate"),
                    func.coalesce(func.stddev_samp(Jobs.hourlyRate), 0.0).label("wageVariance"),
                    shift_hours_avg.label("avgShiftHours"),
                    func.coalesce(func.stddev_samp(shift_duration), 0.0).label("shiftHourVariance"),
                    func.coalesce(func.count(distinct(Jobs.educationRequirement)), 0).label("educationLevelCount"),
                )
                .select_from(Employers)
                .join(Jobs, Jobs.employerId == Employers.employerId, isouter=True)
                .join(Buildings, Buildings.buildingId == Employers.buildingId, isouter=True)
                .group_by(
                    Employers.employerId,
                    Employers.location,
                    Employers.buildingId,
                    Buildings.location,
                )
                .order_by(Employers.employerId)
            )

            rows = session.exec(stmt).all()
            data = []

            for row in rows:
                (
                    employer_id,
                    employer_location,
                    building_id,
                    building_location,
                    job_count,
                    avg_hourly_rate,
                    wage_variance,
                    avg_shift_hours,
                    shift_hours_variance,
                    edu_level_count,
                ) = row

                point = EmployerService.parse_wkt_point(employer_location)
                rings = EmployerService.parse_wkt_polygon(building_location)
                if point is None and rings:
                    point = EmployerService.polygon_centroid(rings)

                if point is None:
                    continue

                ah = float(avg_hourly_rate or 0)
                wv = float(wage_variance or 0)
                ash = float(avg_shift_hours or 0)
                shv = float(shift_hours_variance or 0)
                elc = int(edu_level_count or 0)

                wage_cv = wv / max(ah, 1.0) if ah > 0 else 0.0
                shift_cv = shv / max(ash, 1.0) if ash > 0 else 0.0
                edu_discount = 1.0 / (1.0 + elc * 0.25)
                instability_score = (wage_cv * 0.6 + shift_cv * 0.4) * edu_discount

                data.append({
                    "employerId": employer_id,
                    "buildingId": building_id,
                    "location": {"x": point[0], "y": point[1]},
                    "buildingPolygon": {
                        "type": "Polygon",
                        "coordinates": rings,
                    } if rings else None,
                    "jobCount": int(job_count or 0),
                    "avgHourlyRate": ah,
                    "wageVariance": wv,
                    "avgShiftHours": ash,
                    "shiftHourVariance": shv,
                    "educationLevelCount": elc,
                    "instabilityScore": round(instability_score, 6),
                })

            return Result.ok({"data": data})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_detail(session: Session, employer_id: int) -> Result:
        try:
            jobs_stmt = select(Jobs).where(Jobs.employerId == employer_id)
            jobs = session.exec(jobs_stmt).all()

            job_ids = [job.jobId for job in jobs if job.jobId is not None]
            job_items = []
            for job in jobs:
                start_time = job.startTime
                end_time = job.endTime
                shift_hours = None
                if start_time and end_time:
                    shift_seconds = (
                        end_time.hour * 3600 + end_time.minute * 60 + end_time.second
                    ) - (
                        start_time.hour * 3600 + start_time.minute * 60 + start_time.second
                    )
                    shift_hours = shift_seconds / 3600.0

                job_items.append({
                    "jobId": job.jobId,
                    "hourlyRate": job.hourlyRate,
                    "educationRequirement": job.educationRequirement.value if hasattr(job.educationRequirement, "value") else job.educationRequirement,
                    "shiftHours": shift_hours,
                })

            avg_city_wage_stmt = select(func.avg(Jobs.hourlyRate))
            city_avg_wage = session.exec(avg_city_wage_stmt).one() or 0

            participant_count = 0
            if job_ids:
                participant_stmt = (
                    select(func.count(distinct(ActivityLogs.participantId)))
                    .where(ActivityLogs.jobId.in_(job_ids))
                )
                participant_count = session.exec(participant_stmt).one() or 0

            return Result.ok({
                "employerId": employer_id,
                "jobs": job_items,
                "cityAvgWage": float(city_avg_wage or 0),
                "participantCount": int(participant_count or 0),
            })
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)
