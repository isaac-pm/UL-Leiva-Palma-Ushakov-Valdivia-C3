"""
Author geralm

Do not touch this file, the based models is the information mapped from the .csv -> SQL table.
Modifiying this will take us 16:30 hours inserting millions of data 
if you want (and 'll have) to add custom tables consider  ->>>>  visualization_models.py
"""

import uuid
from datetime import datetime, time
from typing import List, Optional, Dict, Any
from enum import Enum
from sqlalchemy import Time, Column, DateTime

from sqlmodel import SQLModel, Field
from sqlalchemy.dialects.postgresql import JSONB


# ================= ENUMS =================

class EnumCurrentMode(str, Enum):
    AT_HOME = "AtHome"
    TRANSPORT = "Transport"
    AT_RECREATION = "AtRecreation"
    AT_RESTAURANT = "AtRestaurant"
    AT_WORK = "AtWork"


class EnumBuildingType(str, Enum):
    COMMERCIAL = "Commercial"
    RESIDENTIAL = "Residential"
    SCHOOL = "School"


class EnumEducationLevel(str, Enum):
    LOW = "Low"
    HIGH_SCHOOL_OR_COLLEGE = "HighSchoolOrCollege"
    BACHELORS = "Bachelors"
    GRADUATE = "Graduate"


class EnumInterestGroup(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"
    G = "G"
    H = "H"
    I = "I"
    J = "J"


class EnumVenueType(str, Enum):
    APARTMENT = "Apartment"
    PUB = "Pub"
    RESTAURANT = "Restaurant"
    WORKPLACE = "Workplace"


class EnumFinancialCategory(str, Enum):
    EDUCATION = "Education"
    FOOD = "Food"
    RECREATION = "Recreation"
    RENT_ADJUSTMENT = "RentAdjustment"
    SHELTER = "Shelter"
    WAGE = "Wage"


class EnumTravelPurpose(str, Enum):
    COMING_BACK_FROM_RESTAURANT = "Coming Back From Restaurant"
    EATING = "Eating"
    GOING_BACK_TO_HOME = "Going Back to Home"
    RECREATION = "Recreation (Social Gathering)"
    WORK_HOME_COMMUTE = "Work/Home Commute"


# ================= ATTRIBUTE MODELS =================

class Buildings(SQLModel, table=True):
    __tablename__ = "buildings"

    buildingId: int = Field(primary_key=True)
    location: Optional[str] = Field(default=None)
    buildingType: Optional[EnumBuildingType] = Field(default=None, index=True)
    maxOccupancy: Optional[int] = Field(default=None)
    units: List[int] = Field(default=[], sa_column=Column(JSONB, nullable=True))


class Apartments(SQLModel, table=True):
    __tablename__ = "apartments"

    apartmentId: int = Field(primary_key=True)
    rentalCost: Optional[float] = Field(default=None)
    maxOccupancy: Optional[int] = Field(default=None)
    numberOfRooms: Optional[int] = Field(default=None)
    location: Optional[str] = Field(default=None)
    buildingId: Optional[int] = Field(default=None, foreign_key="buildings.buildingId")


class Employers(SQLModel, table=True):
    __tablename__ = "employers"

    employerId: int = Field(primary_key=True)
    location: Optional[str] = Field(default=None)
    buildingId: Optional[int] = Field(default=None, foreign_key="buildings.buildingId")


class Pubs(SQLModel, table=True):
    __tablename__ = "pubs"

    pubId: int = Field(primary_key=True)
    hourlyCost: Optional[float] = Field(default=None)
    maxOccupancy: Optional[int] = Field(default=None)
    location: Optional[str] = Field(default=None)
    buildingId: Optional[int] = Field(default=None, foreign_key="buildings.buildingId")


class Restaurants(SQLModel, table=True):
    __tablename__ = "restaurants"

    restaurantId: int = Field(primary_key=True)
    foodCost: Optional[float] = Field(default=None)
    maxOccupancy: Optional[int] = Field(default=None)
    location: Optional[str] = Field(default=None)
    buildingId: Optional[int] = Field(default=None, foreign_key="buildings.buildingId")


class Schools(SQLModel, table=True):
    __tablename__ = "schools"

    schoolId: int = Field(primary_key=True)
    monthlyFees: Optional[float] = Field(default=None)
    maxEnrollment: Optional[int] = Field(default=None)
    location: Optional[str] = Field(default=None)
    buildingId: Optional[int] = Field(default=None, foreign_key="buildings.buildingId")


class Jobs(SQLModel, table=True):
    __tablename__ = "jobs"

    jobId: int = Field(primary_key=True)
    employerId: Optional[int] = Field(default=None, foreign_key="employers.employerId")
    hourlyRate: Optional[float] = Field(default=None)
    startTime: Optional[time] = Field(default=None, sa_column=Column(Time, nullable=True))
    endTime: Optional[time] = Field(default=None, sa_column=Column(Time, nullable=True))
    daysToWork: List[str] = Field(default=[], sa_column=Column(JSONB, nullable=True))
    educationRequirement: Optional[EnumEducationLevel] = Field(default=None)


class Participants(SQLModel, table=True):
    __tablename__ = "participants"

    participantId: int = Field(primary_key=True)
    householdSize: Optional[int] = Field(default=None)
    haveKids: Optional[bool] = Field(default=None)
    age: Optional[int] = Field(default=None)
    educationLevel: Optional[EnumEducationLevel] = Field(default=None)
    interestGroup: Optional[EnumInterestGroup] = Field(default=None)
    joviality: Optional[float] = Field(default=None)


# ================= EVENT & LOG MODELS =================

class ActivityLogs(SQLModel, table=True):
    __tablename__ = "activity_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: Optional[int] = Field(default=None, index=True, foreign_key="participants.participantId")
    timestamp: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), index=True, nullable=True))
    currentLocation: Optional[str] = Field(default=None)
    currentMode: Optional[EnumCurrentMode] = Field(default=None, index=True)
    hungerStatus: Optional[str] = Field(default=None)
    sleepStatus: Optional[str] = Field(default=None)
    apartmentId: Optional[int] = Field(default=None, foreign_key="apartments.apartmentId")
    availableBalance: Optional[float] = Field(default=None)
    jobId: Optional[int] = Field(default=None, foreign_key="jobs.jobId")
    financialStatus: Optional[str] = Field(default=None)
    dailyFoodBudget: Optional[float] = Field(default=None)
    weeklyExtraBudget: Optional[float] = Field(default=None)
    file_meta: Dict[str, Any] = Field( 
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False)
    )


class CheckinJournal(SQLModel, table=True):
    __tablename__ = "checkin_journal"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: Optional[int] = Field(default=None, foreign_key="participants.participantId")
    timestamp: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), index=True, nullable=True))
    venueId: Optional[int] = Field(default=None)
    venueType: Optional[EnumVenueType] = Field(default=None)


class FinancialJournal(SQLModel, table=True):
    __tablename__ = "financial_journal"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: Optional[int] = Field(default=None, foreign_key="participants.participantId")
    timestamp: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), index=True, nullable=True))
    category: Optional[EnumFinancialCategory] = Field(default=None, index=True)
    amount: Optional[float] = Field(default=None)


class SocialNetwork(SQLModel, table=True):
    __tablename__ = "social_network"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timestamp: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), index=True, nullable=True))
    participantIdFrom: Optional[int] = Field(default=None, foreign_key="participants.participantId")
    participantIdTo: Optional[int] = Field(default=None, foreign_key="participants.participantId")


class TravelJournal(SQLModel, table=True):
    __tablename__ = "travel_journal"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: Optional[int] = Field(default=None, foreign_key="participants.participantId")
    travelStartTime: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), index=True, nullable=True))
    travelStartLocationId: Optional[int] = Field(default=None)
    travelEndTime: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    travelEndLocationId: Optional[int] = Field(default=None)
    purpose: Optional[EnumTravelPurpose] = Field(default=None)
    checkInTime: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    checkOutTime: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    startingBalance: Optional[float] = Field(default=None)
    endingBalance: Optional[float] = Field(default=None)