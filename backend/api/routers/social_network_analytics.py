from fastapi import APIRouter, Depends, Query, Path, BackgroundTasks
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.social_network_analytics import VisualAnalyticsService

router = APIRouter(tags=["Visual Analytics"])

def background_compute_task(year: int, month: int):
    """
    Wrapper para ejecutar el cómputo en segundo plano con su propia sesión aislada.
    """
    # Necesitamos una nueva sesión para el hilo en segundo plano
    with next(get_db_session()) as session:
        VisualAnalyticsService.compute_monthly_snapshot(session, year, month)

@router.post("/visual-analytics", response_model=ApiResponse)
def api_compute_snapshot(
    background_tasks: BackgroundTasks,
    year: int = Query(..., description="Year to compute (e.g., 2022)"),
    month: int = Query(..., ge=1, le=12, description="Month to compute (1-12)"),
    # Usamos la sesión de inyección solo para validaciones previas si fueran necesarias, 
    # pero el worker usa la suya propia.
):
    # Encolamos la tarea pesada
    background_tasks.add_task(background_compute_task, year, month)

    # Respondemos de inmediato (HTTP 202 Accepted conceptualmente, aunque ApiResponse maneja el formato)
    return ApiResponse.success(
        data={"year": year, "month": month, "status": "processing"},
        msg="Snapshot computation started in the background."
    )

@router.delete("/visual-analytics", response_model=ApiResponse)
def api_clean_snapshot(
    year: int = Query(..., description="Year to clean"),
    month: int = Query(..., ge=1, le=12, description="Month to clean"),
    session: Session = Depends(get_db_session)
):
    result = VisualAnalyticsService.delete_monthly_snapshot(session, year, month)

    if not result.is_success:
        raise HTTPException(status_code=result.status_code, detail=result.error)

    return ApiResponse.success(
        data=result.value,
        msg=f"Analytics data for {year}-{month} deleted successfully"
    )

@router.get("/visual-analytics/network", response_model=ApiResponse)
def api_get_macro_network(
    year: int = Query(..., description="Year to retrieve"),
    month: int = Query(..., ge=1, le=12, description="Month to retrieve"),
    session: Session = Depends(get_db_session)
):
    result = VisualAnalyticsService.get_macro_network(session, year, month)

    if not result.is_success:
        raise HTTPException(status_code=result.status_code, detail=result.error)

    return ApiResponse.success(
        data=result.value,
        msg="Macro network retrieved successfully"
    )

@router.get("/visual-analytics/sankey", response_model=ApiResponse)
def api_get_sankey_flows(
    year: int = Query(..., description="Year to retrieve"),
    month: int = Query(..., ge=1, le=12, description="Month to retrieve"),
    session: Session = Depends(get_db_session)
):
    result = VisualAnalyticsService.get_sankey_flows(session, year, month)

    if not result.is_success:
        raise HTTPException(status_code=result.status_code, detail=result.error)

    return ApiResponse.success(
        data=result.value,
        msg="Sankey flows retrieved successfully"
    )