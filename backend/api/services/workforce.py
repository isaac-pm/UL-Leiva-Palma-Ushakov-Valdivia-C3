import json
import os
from collections import defaultdict

from sqlmodel import Session, select, func

from core.result import Result
from core.models.base import (
    ActivityLogs, Jobs, Employers, Buildings,
    Apartments, Pubs, Restaurants, Schools, EnumCurrentMode,
)

CACHE_FILE = "/tmp/workforce_cache.json"


def derive_sector(building_type, has_apartment, has_pub, has_restaurant, has_school):
    if has_school:
        return "Education"
    if has_pub or has_restaurant:
        return "Hospitality"
    if has_apartment:
        return "Housing"
    if building_type == "Residential":
        return "Housing"
    if building_type == "School":
        return "Education"
    return "General Services"


def compute_monthly_workforce(session: Session) -> dict:
    # Step 1: jobId -> employerId
    job_rows = session.exec(select(Jobs.jobId, Jobs.employerId)).all()
    job_to_employer = {job_id: emp_id for job_id, emp_id in job_rows}

    # Step 2: Distinct (participantId, month, jobId) where AtWork
    stmt = (
        select(
            ActivityLogs.participantId,
            func.date_trunc("month", ActivityLogs.timestamp).label("month"),
            ActivityLogs.jobId,
        )
        .where(ActivityLogs.currentMode == EnumCurrentMode.AT_WORK)
        .distinct()
        .order_by(func.date_trunc("month", ActivityLogs.timestamp))
    )
    rows = session.exec(stmt).all()

    # Step 3: Group by employer -> month -> participant set
    seen_employers = set()
    emp_months = defaultdict(lambda: defaultdict(set))
    for pid, month_date, job_id in rows:
        if job_id is None:
            continue
        eid = job_to_employer.get(job_id)
        if eid is None:
            continue
        seen_employers.add(eid)
        month_key = month_date.isoformat()[:7]
        emp_months[eid][month_key].add(pid)

    # Step 4: Employer -> sector mapping (no Cartesian joins)
    sector_map = {}
    if seen_employers:
        # 1. Fetch employers and building types independently
        emp_rows = session.exec(
            select(Employers.employerId, Employers.buildingId, Buildings.buildingType)
            .outerjoin(Buildings, Buildings.buildingId == Employers.buildingId)
            .where(Employers.employerId.in_(list(seen_employers)))
        ).all()

        building_ids = {row.buildingId for row in emp_rows if row.buildingId}

        # 2. Query amenity existence independently using O(1) set lookups
        b_apartments: set = set()
        b_pubs: set = set()
        b_restaurants: set = set()
        b_schools: set = set()

        if building_ids:
            b_ids_list = list(building_ids)
            b_apartments = set(
                session.exec(select(Apartments.buildingId).where(Apartments.buildingId.in_(b_ids_list))).all()
            )
            b_pubs = set(
                session.exec(select(Pubs.buildingId).where(Pubs.buildingId.in_(b_ids_list))).all()
            )
            b_restaurants = set(
                session.exec(select(Restaurants.buildingId).where(Restaurants.buildingId.in_(b_ids_list))).all()
            )
            b_schools = set(
                session.exec(select(Schools.buildingId).where(Schools.buildingId.in_(b_ids_list))).all()
            )

        # 3. Derive sectors in memory
        for emp_id, b_id, btype in emp_rows:
            bt = btype.value if hasattr(btype, "value") else (btype or "")
            sector_map[emp_id] = derive_sector(
                bt,
                has_apartment=(b_id in b_apartments),
                has_pub=(b_id in b_pubs),
                has_restaurant=(b_id in b_restaurants),
                has_school=(b_id in b_schools),
            )

        for eid in seen_employers:
            sector_map.setdefault(eid, "General Services")

    # Step 5: Month-over-month metrics
    all_months = sorted({m for emp in emp_months.values() for m in emp})

    sector_agg = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))
    employer_data = {}

    for eid, months in emp_months.items():
        sector = sector_map.get(eid, "Other")
        sorted_m = sorted(months.keys())
        prev_pids = set()
        emp_series = {}
        for i, m in enumerate(sorted_m):
            curr_pids = months[m]
            total = len(curr_pids)
            if i == 0:
                retained, hires, separations = 0, total, 0
            else:
                retained = len(curr_pids & prev_pids)
                hires = len(curr_pids - prev_pids)
                separations = len(prev_pids - curr_pids)
            emp_series[m] = [retained, hires, separations, total]
            sa = sector_agg[sector][m]
            sa[0] += retained; sa[1] += hires; sa[2] += separations; sa[3] += total
            prev_pids = curr_pids
        employer_data[eid] = (sector, emp_series)

    # Step 6: Build JSON response
    sectors_list = []
    for sname in sorted(sector_agg.keys()):
        smonths = sector_agg[sname]
        months_list = []
        for m in all_months:
            d = smonths.get(m, [0, 0, 0, 0])
            tot = max(d[3], 1)
            months_list.append({
                "month": m,
                "retained": d[0], "hires": d[1], "separations": d[2], "total": d[3],
                "churnRate": round(d[2] / tot, 4),
                "netGrowth": d[1] - d[2],
                "netGrowthRate": round((d[1] - d[2]) / tot, 4),
            })

        employers_list = []
        for eid in sorted(employer_data.keys()):
            sec, em = employer_data[eid]
            if sec != sname:
                continue
            em_list = []
            for m in all_months:
                d = em.get(m, [0, 0, 0, 0])
                tot = max(d[3], 1)
                em_list.append({
                    "month": m,
                    "retained": d[0], "hires": d[1], "separations": d[2], "total": d[3],
                    "churnRate": round(d[2] / tot, 4),
                    "netGrowth": d[1] - d[2],
                    "netGrowthRate": round((d[1] - d[2]) / tot, 4),
                })
            employers_list.append({"employerId": eid, "months": em_list})

        sectors_list.append({"name": sname, "months": months_list, "employers": employers_list})

    return {"months": all_months, "sectors": sectors_list}


def aggregates_from_monthly(monthly_data: dict) -> dict:
    sectors = monthly_data.get("sectors", [])
    employers_list = []

    for sector in sectors:
        sector_name = sector.get("name")
        for emp in sector.get("employers", []):
            employer_id = emp.get("employerId")
            months = emp.get("months", [])
            if not months:
                continue

            start_month = months[0]
            end_month = months[-1]

            start_headcount = start_month.get("total", 0)
            end_headcount = end_month.get("total", 0)

            total_hires = sum(m.get("hires", 0) for m in months)
            total_separations = sum(m.get("separations", 0) for m in months)
            total_turnover = total_hires + total_separations

            monthly_headcounts = [m.get("total", 0) for m in months if m.get("total", 0) > 0]
            avg_headcount = sum(monthly_headcounts) / len(monthly_headcounts) if monthly_headcounts else 1

            volatility_index = total_turnover / avg_headcount if avg_headcount > 0 else 0

            net_change = end_headcount - start_headcount
            net_change_pct = (net_change / start_headcount) * 100 if start_headcount > 0 else 0

            employers_list.append({
                "employerId": employer_id,
                "industrySector": sector_name,
                "startHeadcount": start_headcount,
                "endHeadcount": end_headcount,
                "totalHires": total_hires,
                "totalSeparations": total_separations,
                "totalTurnover": total_turnover,
                "netChange": net_change,
                "netChangePct": round(net_change_pct, 2),
                "volatilityIndex": round(volatility_index, 4),
                "avgHeadcount": round(avg_headcount, 2),
                "monthCount": len(months),
                "months": months,
            })

    unique_sectors = sorted({e["industrySector"] for e in employers_list})

    return {
        "employers": employers_list,
        "sectors": unique_sectors,
        "aggregates": {
            "totalEmployers": len(employers_list),
            "maxVolatility": max(e["volatilityIndex"] for e in employers_list) if employers_list else 0,
            "maxTurnover": max(e["totalTurnover"] for e in employers_list) if employers_list else 0,
            "maxHeadcount": max(max(e["startHeadcount"], e["endHeadcount"]) for e in employers_list) if employers_list else 0,
        }
    }


class WorkforceService:

    @staticmethod
    def get_monthly_workforce(session: Session) -> Result:
        try:
            # Serve from cache if available
            if os.path.exists(CACHE_FILE):
                with open(CACHE_FILE) as f:
                    data = json.load(f)
                return Result.ok({"data": data})

            # Compute and cache
            data = compute_monthly_workforce(session)
            with open(CACHE_FILE, "w") as f:
                json.dump(data, f)
            return Result.ok({"data": data})

        except Exception as e:
            if os.path.exists(CACHE_FILE):
                try:
                    os.remove(CACHE_FILE)
                except:
                    pass
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_aggregate_workforce(session: Session) -> Result:
        try:
            monthly_result = WorkforceService.get_monthly_workforce(session)
            if not monthly_result.is_success:
                return monthly_result

            monthly_data = monthly_result.value.get("data")
            if not monthly_data:
                return Result.fail("500_INTERNAL: Invalid monthly data format", status_code=500)

            agg_data = aggregates_from_monthly(monthly_data)
            return Result.ok({"data": agg_data})

        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)
