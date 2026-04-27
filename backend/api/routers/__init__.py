from api.routers.participants import router as participants_router
from api.routers.buildings import router as buildings_router
from api.routers.apartments import router as apartments_router
from api.routers.employers import router as employers_router
from api.routers.venues import router as venues_router
from api.routers.jobs import router as jobs_router
from api.routers.checkin import router as checkin_router
from api.routers.financial import router as financial_router
from api.routers.social import router as social_router
from api.routers.travel import router as travel_router
from api.routers.activity import router as activity_router

__all__ = [
    "participants_router",
    "buildings_router",
    "apartments_router",
    "employers_router",
    "venues_router",
    "jobs_router",
    "checkin_router",
    "financial_router",
    "social_router",
    "travel_router",
    "activity_router",
]