from fastapi import APIRouter, Depends, Query, Path
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from core.result import Result as ServiceResult
from api.schemas.ApiResponse import ApiResponse
from api.services.buildings import BuildingService

router = APIRouter(tags=["Buildings"])


@router.get("/buildings/count", response_model=ApiResponse)
def api_get_building_count(
    session: Session = Depends(get_db_session)
):
    result = BuildingService.get_count(session)

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Building count retrieved successfully"
    )


@router.get("/buildings", response_model=ApiResponse)
def api_list_buildings(
    limit: int = Query(20, ge=1, le=100, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session)
):
    result = BuildingService.list_buildings(
        session=session,
        limit=limit,
        offset=offset
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Buildings retrieved successfully"
    )


@router.get("/buildings/{building_id}", response_model=ApiResponse)
def api_get_building(
    building_id: int = Path(..., description="Building ID"),
    session: Session = Depends(get_db_session)
):
    result = BuildingService.get_by_id(
        session=session,
        building_id=building_id
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error
        )

    return ApiResponse.success(
        data=result.value,
        msg="Building retrieved successfully"
    )