import uuid
from datetime import datetime, time
from typing import List, Optional
from enum import Enum
from sqlalchemy import Time

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
    
    participantId: int = Field(index=True, default=None, foreign_key="participants.participantId")
    timestamp: datetime = Field(
        sa_column=Column(DateTime(timezone=True), index=True, default=None)
    )
    currentLocation: str = Field(default=None)
    currentMode: EnumCurrentMode = Field(default=None, index=True)
    hungerStatus: str = Field(default=None)
    sleepStatus: str = Field(default=None)
    apartmentId: int = Field(default=None, foreign_key="apartments.apartmentId")
    availableBalance: float = Field(default=None)
    jobId: Optional[int] = Field(default=None, foreign_key="jobs.jobId")
    financialStatus: str = Field(default=None)
    dailyFoodBudget: float = Field(default=None)
    weeklyExtraBudget: float = Field(default=None)

class EnumBuildingType(str, Enum):
    COMMERCIAL = "Commercial"
    RESIDENTIAL = "Residential"
    SCHOOL = "School"

class Buildings(SQLModel, table=True):
    __tablename__ = "buildings"
    
    buildingId: int = Field(primary_key=True)
    location: str = Field(default=None) 
    buildingType: EnumBuildingType = Field(default=None, index=True)
    maxOccupancy: Optional[int] = Field(default=None)
    
    # Architecture Warning: Storing an array of IDs pointing to different tables violates referential integrity.
    units: List[int] = Field(default=[], sa_column=Column(JSONB))


class Apartments(SQLModel, table=True):
    __tablename__ = "apartments"
    apartmentId: int = Field(primary_key=True)
    rentalCost: float = Field(default=None)
    maxOccupancy: Optional[int] = Field(default=None)
    numberOfRooms: int = Field(default=None)
    location: str = Field(default=None)
    buildingId: int = Field(default=None, foreign_key="buildings.buildingId")

class Employers(SQLModel, table=True):
    __tablename__ = "employers"
    employerId: int = Field(primary_key=True)
    location: str = Field(default=None)
    buildingId: int = Field(default=None, foreign_key="buildings.buildingId")

class Pubs(SQLModel, table=True):
    __tablename__ = "pubs"
    pubId: int = Field(primary_key=True)
    hourlyCost: float = Field(default=None)
    maxOccupancy: Optional[int] = Field(default=None)
    location: str = Field(default=None)
    buildingId: int = Field(default=None, foreign_key="buildings.buildingId")

class Restaurants(SQLModel, table=True):
    __tablename__ = "restaurants"
    restaurantId: int = Field(primary_key=True)
    foodCost: float = Field(default=None)
    maxOccupancy: Optional[int] = Field(default=None)
    location: str = Field(default=None)
    buildingId: int = Field(default=None, foreign_key="buildings.buildingId")

class Schools(SQLModel, table=True):
    __tablename__ = "schools"
    schoolId: int = Field(primary_key=True)
    monthlyFees: Optional[float] = Field(default=None)
    maxEnrollment: Optional[int] = Field(default=None)
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
    employerId: int = Field(default=None, foreign_key="employers.employerId")
    hourlyRate: float = Field(default=None)
    startTime: time = Field(sa_column=Column(Time, nullable=False))
    endTime: time = Field(sa_column=Column(Time, nullable=False))
    daysToWork: List[str] = Field(default=[], sa_column=Column(JSONB))
    educationRequirement: EnumEducationLevel = Field(default=None)

class Participants(SQLModel, table=True):
    __tablename__ = "participants"
    participantId: int = Field(primary_key=True)
    householdSize: int =Field(default=None)
    haveKids: bool = Field(default=None)
    age: int = Field(default=None)
    educationLevel: EnumEducationLevel = Field(default=None)
    interestGroup: EnumInterestGroup = Field(default=None)
    joviality: float =Field(default=None)

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
    participantId: int = Field(default=None, foreign_key="participants.participantId")
    timestamp: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, default=None))
    venueId: int = Field(default=None)
    venueType: EnumVenueType = Field(default=None)

class FinancialJournal(SQLModel, table=True):
    __tablename__ = "financial_journal"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: int = Field(default=None, foreign_key="participants.participantId")
    timestamp: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, default=None))
    category: EnumFinancialCategory = Field(default=None, index=True)
    amount: float =Field(default=None)

class SocialNetwork(SQLModel, table=True):
    __tablename__ = "social_network"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timestamp: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, default=None))
    participantIdFrom: int = Field(default=None, foreign_key="participants.participantId")
    participantIdTo: int = Field(default=None, foreign_key="participants.participantId")

class TravelJournal(SQLModel, table=True):
    __tablename__ = "travel_journal"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    participantId: int = Field(default=None, foreign_key="participants.participantId")
    travelStartTime: datetime = Field(sa_column=Column(DateTime(timezone=True), index=True, default=None))
    travelStartLocationId: Optional[int] = Field(default=None)
    travelEndTime: datetime = Field(sa_column=Column(DateTime(timezone=True), default=None))
    travelEndLocationId: int = Field(default=None)
    purpose: EnumTravelPurpose =Field(default=None)
    checkInTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=True))
    checkOutTime: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=True))
    startingBalance: float = Field(default=None)
    endingBalance: float = Field(default=None)