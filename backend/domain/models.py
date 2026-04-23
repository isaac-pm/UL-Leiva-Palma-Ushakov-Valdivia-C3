import uuid
from datetime import datetime
from typing import List, Optional
from enum import Enum

from sqlmodel import SQLModel, Field, Column, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import DateTime

class EnumCurrentMode(str, Enum):
    AT_HOME = "AtHome"
    TRANSPORT = "Transport"
    AT_RECREATION = "AtRecreation"
    AT_RESTAURANT = "AtRestaurant"
    AT_WORK = "AtWork"

class ActivityLogs(SQLModel, table=True):
    __tablename__ = "activity_logs"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    
    participantId: int = Field(index=True, nullable=False, foreign_key="participants.participantId")
    timestamp: datetime = Field(
        sa_column=Column(DateTime(timezone=True), index=True, nullable=False)
    )
    currentLocation: str = Field(nullable=False)
    currentMode: EnumCurrentMode = Field(nullable=False, index=True)
    hungerStatus: str = Field(nullable=False)
    sleepStatus: str = Field(nullable=False)
    apartmentId: int = Field(nullable=False, foreign_key="apartments.apartmentId")
    availableBalance: float = Field(nullable=False)
    jobId: Optional[int] = Field(default=None, foreign_key="jobs.jobId")
    financialStatus: str = Field(nullable=False)
    dailyFoodBudget: float = Field(nullable=False)
    weeklyExtraBudget: float = Field(nullable=False)

class EnumBuildingType(str, Enum):
    COMMERCIAL = "Commercial"
    RESIDENTIAL = "Residential"
    SCHOOL = "School"

class Buildings(SQLModel, table=True):
    __tablename__ = "buildings"
    
    buildingId: int = Field(primary_key=True)
    location: str = Field(nullable=False) 
    buildingType: EnumBuildingType = Field(nullable=False, index=True)
    maxOccupancy: Optional[int] = Field(default=None)
    
    # Architecture Warning: Storing an array of IDs pointing to different tables violates referential integrity.
    units: List[int] = Field(default=[], sa_column=Column(JSONB))


class Apartments(SQLModel, table=True):
    __tablename__ = "apartments"
    apartmentId: int = Field(primary_key=True)
    rentalCost: float = Field(nullable=False)
    maxOccupancy: int = Field(nullable=False)
    numberOfRooms: int = Field(nullable=False)
    location: str = Field(nullable=False)
    buildingId: int = Field(nullable=False, foreign_key="buildings.buildingId")

class Employers(SQLModel, table=True):
    __tablename__ = "employers"
    employerId: int = Field(primary_key=True)
    location: str = Field(nullable=False)
    buildingId: int = Field(nullable=False, foreign_key="buildings.buildingId")

class Pubs(SQLModel, table=True):
    __tablename__ = "pubs"
    pubId: int = Field(primary_key=True)
    hourlyCost: float = Field(nullable=False)
    maxOccupancy: int = Field(nullable=False)
    location: str = Field(nullable=False)
    buildingId: int = Field(nullable=False, foreign_key="buildings.buildingId")

class Restaurants(SQLModel, table=True):
    __tablename__ = "restaurants"
    restaurantId: int = Field(primary_key=True)
    foodCost: float = Field(nullable=False)
    maxOccupancy: int = Field(nullable=False)
    location: str = Field(nullable=False)
    buildingId: int = Field(nullable=False, foreign_key="buildings.buildingId")

class Schools(SQLModel, table=True):
    __tablename__ = "schools"
    schoolId: int = Field(primary_key=True)
    monthlyFees: float = Field(nullable=False)
    maxEnrollment: int = Field(nullable=False)
    location: str = Field(nullable=False)
    buildingId: int = Field(nullable=False, foreign_key="buildings.buildingId")

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

class Jobs(SQLModel, table=True):
    __tablename__ = "jobs"
    jobId: int = Field(primary_key=True)
    employerId: int = Field(nullable=False, foreign_key="employers.employerId")
    hourlyRate: float = Field(nullable=False)
    startTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    endTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    daysToWork: List[str] = Field(default=[], sa_column=Column(JSONB))
    educationRequirement: EnumEducationLevel = Field(nullable=False)

class Participants(SQLModel, table=True):
    __tablename__ = "participants"
    participantId: int = Field(primary_key=True)
    householdSize: int = Field(nullable=False)
    haveKids: bool = Field(nullable=False)
    age: int = Field(nullable=False)
    educationLevel: EnumEducationLevel = Field(nullable=False)
    interestGroup: EnumInterestGroup = Field(nullable=False)
    joviality: float = Field(nullable=False)

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

class CheckinJournal(SQLModel, table=True):
    __tablename__ = "checkin_journal"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: int = Field(nullable=False, foreign_key="participants.participantId")
    timestamp: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, nullable=False))
    venueId: int = Field(nullable=False)
    venueType: EnumVenueType = Field(nullable=False)

class FinancialJournal(SQLModel, table=True):
    __tablename__ = "financial_journal"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: int = Field(nullable=False, foreign_key="participants.participantId")
    timestamp: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, nullable=False))
    category: EnumFinancialCategory = Field(nullable=False, index=True)
    amount: float = Field(nullable=False)

class SocialNetwork(SQLModel, table=True):
    __tablename__ = "social_network"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timestamp: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, nullable=False))
    participantIdFrom: int = Field(nullable=False, foreign_key="participants.participantId")
    participantIdTo: int = Field(nullable=False, foreign_key="participants.participantId")

class TravelJournal(SQLModel, table=True):
    __tablename__ = "travel_journal"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: int = Field(nullable=False, foreign_key="participants.participantId")
    travelStartTime: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, nullable=False))
    travelStartLocationId: Optional[int] = Field(default=None)
    travelEndTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    travelEndLocationId: int = Field(nullable=False)
    purpose: EnumTravelPurpose = Field(nullable=False)
    checkInTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    checkOutTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    startingBalance: float = Field(nullable=False)
    endingBalance: float = Field(nullable=False)