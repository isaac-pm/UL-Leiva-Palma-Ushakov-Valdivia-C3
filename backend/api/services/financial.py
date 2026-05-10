import json

from sqlalchemy import text
from sqlmodel import Session, select, func

from core.result import Result
from core.models.base import FinancialJournal


class FinancialService:

    @staticmethod
    def get_resident_health_summary(session: Session) -> Result:
        try:
            query = text("""
                WITH financial_monthly AS (
                    SELECT
                        "participantId" AS participant_id,
                        date_trunc('month', timestamp)::date AS month,
                        SUM(CASE WHEN category::text IN ('WAGE', 'Wage') THEN COALESCE(amount, 0) ELSE 0 END) AS wage_income,
                        SUM(CASE WHEN category::text IN ('SHELTER', 'Shelter') THEN ABS(COALESCE(amount, 0)) ELSE 0 END) AS housing_cost,
                        SUM(CASE WHEN category::text IN ('FOOD', 'Food') THEN ABS(COALESCE(amount, 0)) ELSE 0 END) AS food_cost,
                        SUM(CASE WHEN category::text IN ('RECREATION', 'Recreation') THEN ABS(COALESCE(amount, 0)) ELSE 0 END) AS recreation_cost,
                        SUM(CASE WHEN category IS NOT NULL AND category::text NOT IN ('WAGE', 'Wage') THEN ABS(COALESCE(amount, 0)) ELSE 0 END) AS total_expenses
                    FROM financial_journal
                    WHERE timestamp IS NOT NULL
                        AND "participantId" IS NOT NULL
                    GROUP BY "participantId", date_trunc('month', timestamp)::date
                ),
                latest_balance AS (
                    SELECT DISTINCT ON ("participantId", date_trunc('month', "travelStartTime")::date)
                        "participantId" AS participant_id,
                        date_trunc('month', "travelStartTime")::date AS month,
                        "endingBalance" AS available_balance
                    FROM travel_journal
                    WHERE "travelStartTime" IS NOT NULL
                        AND "participantId" IS NOT NULL
                        AND "endingBalance" IS NOT NULL
                    ORDER BY "participantId", date_trunc('month', "travelStartTime")::date, "travelStartTime" DESC
                ),
                participant_monthly AS (
                    SELECT
                        COALESCE(f.participant_id, b.participant_id) AS participant_id,
                        COALESCE(f.month, b.month) AS month,
                        COALESCE(f.wage_income, 0) AS wage_income,
                        COALESCE(f.housing_cost, 0) AS housing_cost,
                        COALESCE(f.food_cost, 0) AS food_cost,
                        COALESCE(f.recreation_cost, 0) AS recreation_cost,
                        COALESCE(f.total_expenses, 0) AS total_expenses,
                        b.available_balance,
                        CASE p."educationLevel"::text
                            WHEN 'HIGH_SCHOOL_OR_COLLEGE' THEN 'High school or college'
                            WHEN 'HighSchoolOrCollege' THEN 'High school or college'
                            WHEN 'BACHELORS' THEN 'Bachelors'
                            WHEN 'Bachelors' THEN 'Bachelors'
                            WHEN 'GRADUATE' THEN 'Graduate'
                            WHEN 'Graduate' THEN 'Graduate'
                            WHEN 'LOW' THEN 'Low education'
                            WHEN 'Low' THEN 'Low education'
                            ELSE 'Unknown education'
                        END AS cohort
                    FROM financial_monthly f
                    FULL OUTER JOIN latest_balance b
                        ON b.participant_id = f.participant_id
                        AND b.month = f.month
                    LEFT JOIN participants p
                        ON p."participantId" = COALESCE(f.participant_id, b.participant_id)
                    WHERE COALESCE(f.participant_id, b.participant_id) IS NOT NULL
                        AND COALESCE(f.month, b.month) IS NOT NULL
                ),
                city_summary AS (
                    SELECT
                        month,
                        COUNT(DISTINCT participant_id) AS participant_count,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY available_balance)
                            FILTER (WHERE available_balance IS NOT NULL) AS median_balance,
                        AVG(available_balance) FILTER (WHERE available_balance IS NOT NULL) AS avg_balance,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY wage_income) AS median_income,
                        AVG(wage_income) AS avg_wage,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY housing_cost) AS housing_cost,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY food_cost) AS food_cost,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY recreation_cost) AS recreation_cost,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY total_expenses) AS total_expenses,
                        AVG(total_expenses) AS avg_cost,
                        AVG(wage_income - total_expenses) AS avg_net_cashflow,
                        AVG(CASE WHEN total_expenses > wage_income OR COALESCE(available_balance, 0) < 0 THEN 1.0 ELSE 0.0 END) AS stress_share
                    FROM participant_monthly
                    GROUP BY month
                ),
                cohort_summary AS (
                    SELECT
                        month,
                        cohort,
                        COUNT(DISTINCT participant_id) AS participant_count,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY available_balance)
                            FILTER (WHERE available_balance IS NOT NULL) AS median_balance,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY wage_income) AS median_income,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY housing_cost) AS housing_cost,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY food_cost) AS food_cost,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY recreation_cost) AS recreation_cost,
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY total_expenses) AS total_expenses,
                        AVG(CASE WHEN total_expenses > wage_income OR COALESCE(available_balance, 0) < 0 THEN 1.0 ELSE 0.0 END) AS stress_share
                    FROM participant_monthly
                    GROUP BY month, cohort
                ),
                cohort_json AS (
                    SELECT
                        month,
                        jsonb_agg(
                            jsonb_build_object(
                                'cohort', cohort,
                                'participantCount', participant_count,
                                'medianBalance', COALESCE(median_balance, 0),
                                'medianIncome', COALESCE(median_income, 0),
                                'housingCost', COALESCE(housing_cost, 0),
                                'foodCost', COALESCE(food_cost, 0),
                                'recreationCost', COALESCE(recreation_cost, 0),
                                'totalExpenses', COALESCE(total_expenses, 0),
                                'savingsRate', CASE
                                    WHEN COALESCE(median_income, 0) = 0 THEN 0
                                    ELSE (COALESCE(median_income, 0) - COALESCE(total_expenses, 0)) / median_income
                                END,
                                'stressShare', COALESCE(stress_share, 0)
                            )
                            ORDER BY cohort
                        ) AS cohorts
                    FROM cohort_summary
                    GROUP BY month
                )
                SELECT
                    c.month,
                    c.participant_count,
                    COALESCE(c.median_balance, 0) AS median_balance,
                    COALESCE(c.avg_balance, 0) AS avg_balance,
                    COALESCE(c.median_income, 0) AS median_income,
                    COALESCE(c.avg_wage, 0) AS avg_wage,
                    COALESCE(c.housing_cost, 0) AS housing_cost,
                    COALESCE(c.food_cost, 0) AS food_cost,
                    COALESCE(c.recreation_cost, 0) AS recreation_cost,
                    COALESCE(c.total_expenses, 0) AS total_expenses,
                    COALESCE(c.avg_cost, 0) AS avg_cost,
                    COALESCE(c.avg_net_cashflow, 0) AS avg_net_cashflow,
                    CASE
                        WHEN COALESCE(c.median_income, 0) = 0 THEN 0
                        ELSE (COALESCE(c.median_income, 0) - COALESCE(c.total_expenses, 0)) / c.median_income
                    END AS savings_rate,
                    CASE
                        WHEN COALESCE(c.avg_cost, 0) = 0 THEN NULL
                        ELSE c.avg_wage / c.avg_cost
                    END AS wage_cost_ratio,
                    COALESCE(c.stress_share, 0) AS stress_share,
                    COALESCE(j.cohorts, '[]'::jsonb) AS cohorts
                FROM city_summary c
                LEFT JOIN cohort_json j
                    ON j.month = c.month
                ORDER BY c.month
            """)

            rows = session.execute(query).fetchall()
            months = []

            for row in rows:
                cohorts = row.cohorts
                if isinstance(cohorts, str):
                    cohorts = json.loads(cohorts)

                months.append({
                    "month": row.month.isoformat()[:7],
                    "participantCount": int(row.participant_count or 0),
                    "medianBalance": float(row.median_balance or 0),
                    "avgBalance": float(row.avg_balance or 0),
                    "medianIncome": float(row.median_income or 0),
                    "avgWage": float(row.avg_wage or 0),
                    "housingCost": float(row.housing_cost or 0),
                    "foodCost": float(row.food_cost or 0),
                    "recreationCost": float(row.recreation_cost or 0),
                    "totalExpenses": float(row.total_expenses or 0),
                    "avgCost": float(row.avg_cost or 0),
                    "avgNetCashflow": float(row.avg_net_cashflow or 0),
                    "savingsRate": float(row.savings_rate or 0),
                    "wageCostRatio": float(row.wage_cost_ratio) if row.wage_cost_ratio is not None else None,
                    "stressShare": float(row.stress_share or 0),
                    "cohorts": cohorts or [],
                })

            return Result.ok({
                "source": "aggregate",
                "latestMonth": months[-1]["month"] if months else None,
                "months": months,
                "assumptions": {
                    "balance": "Last monthly travel-journal ending balance per resident.",
                    "cost": "Absolute value of non-wage financial journal amounts.",
                    "stress": "Monthly expenses greater than wages or ending balance below zero.",
                    "cohorts": "Education-level groups from participants.",
                },
            })
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_count(session: Session, participant_id: int = None) -> Result:
        try:
            stmt = select(func.count(FinancialJournal.id))
            if participant_id is not None:
                stmt = stmt.where(FinancialJournal.participantId == participant_id)
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
                select(FinancialJournal)
                .where(FinancialJournal.participantId == participant_id)
                .order_by(FinancialJournal.timestamp.desc())
                .limit(limit)
                .offset(offset)
            )
            results = session.exec(stmt).all()
            data = [row.model_dump() for row in results]
            return Result.ok({"data": data, "participant_id": participant_id, "limit": limit, "offset": offset})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)

    @staticmethod
    def get_by_id(session: Session, financial_id: str) -> Result:
        try:
            import uuid
            financial_uuid = uuid.UUID(financial_id)
            stmt = select(FinancialJournal).where(FinancialJournal.id == financial_uuid)
            result = session.exec(stmt).first()
            if not result:
                return Result.fail(
                    f"404_NOT_FOUND: Financial record {financial_id} not found",
                    status_code=404,
                )
            return Result.ok({"data": result.model_dump()})
        except Exception as e:
            return Result.fail(f"500_INTERNAL: {str(e)}", status_code=500)
