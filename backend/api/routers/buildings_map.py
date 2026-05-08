from fastapi import APIRouter, Depends, Query
from fastapi.exceptions import HTTPException
from sqlmodel import Session

from core.database import get_db_session
from api.schemas.ApiResponse import ApiResponse
from api.services.buildings_map import BuildingMapService

router = APIRouter(tags=["BuildingsMap"])


@router.get("/buildings/map", response_model=ApiResponse)
def api_list_building_polygons(
    limit: int = Query(5000, ge=1, le=20000, description="Max results per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    session: Session = Depends(get_db_session),
):
    result = BuildingMapService.list_building_polygons(
        session=session,
        limit=limit,
        offset=offset,
    )

    if not result.is_success:
        raise HTTPException(
            status_code=result.status_code,
            detail=result.error,
        )

    return ApiResponse.success(
        data=result.value,
        msg="Building polygons retrieved successfully",
    )
