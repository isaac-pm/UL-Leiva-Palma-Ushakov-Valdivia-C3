import uuid
from datetime import date
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Date, Index

class AnalyticParticipantSnapshots(SQLModel, table=True):
    __tablename__ = "analytic_participant_snapshots"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timeWindow: date = Field(sa_column=Column(Date, index=True, nullable=False))
    participantId: int = Field(index=True, foreign_key="participants.participantId")
    
    clusterId: int = Field(index=True)
    pageRankScore: float = Field(default=0.0)
    
    startingBalance: float = Field(default=0.0)
    endingBalance: float = Field(default=0.0)
    financialQuartile: int = Field(index=True)

    __table_args__ = (Index("idx_time_cluster", "timeWindow", "clusterId"),)


class AnalyticMacroEdges(SQLModel, table=True):
    __tablename__ = "analytic_macro_edges"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timeWindow: date = Field(sa_column=Column(Date, index=True, nullable=False))
    
    sourceClusterId: int = Field(index=True)
    targetClusterId: int = Field(index=True)
    interactionCount: int = Field(default=0)
    
    commuteInteractions: int = Field(default=0)
    recreationInteractions: int = Field(default=0)
    eatingInteractions: int = Field(default=0)
    goingHomeInteractions: int = Field(default=0)
    returningFromRestaurantInteractions: int = Field(default=0)


class AnalyticSankeyFlows(SQLModel, table=True):
    __tablename__ = "analytic_sankey_flows"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    timeWindow: date = Field(sa_column=Column(Date, index=True, nullable=False))
    
    sourceFinancialQuartile: int = Field(index=True)
    travelPurpose: str = Field(index=True)
    targetFinancialQuartile: int = Field(index=True)
    
    totalStartingBalance: float = Field(default=0.0)
    totalEndingBalance: float = Field(default=0.0)
    participantCount: int = Field(default=0)