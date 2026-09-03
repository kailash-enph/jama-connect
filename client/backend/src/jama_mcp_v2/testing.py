"""Test management — high-level operations for test plans, cycles, and runs."""

from __future__ import annotations

import logging
from typing import Any

from .api_client import JamaApiClient
from .cache import JamaCache
from .models import TestRunStatus, TestSummary

logger = logging.getLogger(__name__)


class TestManager:
    """Provides high-level test management operations backed by API + cache."""

    def __init__(self, api: JamaApiClient, cache: JamaCache):
        self._api = api
        self._cache = cache

    # ---------- Test Plans ----------

    async def list_test_plans(self, project_id: int, use_cache: bool = True) -> list[dict[str, Any]]:
        """List test plans for a project."""
        if use_cache:
            cached = await self._cache.get_test_plans(project_id)
            if cached:
                return cached

        plans = await self._api.get_test_plans(project_id)
        for p in plans:
            await self._cache.upsert_test_plan(p, project_id)
        return await self._cache.get_test_plans(project_id)

    async def get_test_plan(self, plan_id: int) -> dict[str, Any]:
        return await self._api.get_test_plan(plan_id)

    # ---------- Test Groups ----------

    async def list_test_groups(self, plan_id: int) -> list[dict[str, Any]]:
        """List test groups (sections) within a test plan."""
        return await self._api.get_test_groups(plan_id)

    async def get_test_group_cases(self, group_id: int) -> list[dict[str, Any]]:
        """Get test cases belonging to a test group."""
        return await self._api.get_test_group_test_cases(group_id)

    # ---------- Test Cycles ----------

    async def list_test_cycles(self, plan_id: int, use_cache: bool = True) -> list[dict[str, Any]]:
        """List test cycles for a test plan."""
        if use_cache:
            cached = await self._cache.get_test_cycles(plan_id)
            if cached:
                return cached

        cycles = await self._api.get_test_cycles(plan_id)
        for c in cycles:
            await self._cache.upsert_test_cycle(c, plan_id)
        return await self._cache.get_test_cycles(plan_id)

    async def get_test_cycle(self, cycle_id: int) -> dict[str, Any]:
        return await self._api.get_test_cycle(cycle_id)

    async def create_test_cycle(
        self,
        plan_id: int,
        name: str,
        start_date: str,
        end_date: str,
        test_groups: list[int] | None = None,
    ) -> dict[str, Any]:
        """Create a new test cycle and cache it."""
        result = await self._api.create_test_cycle(
            plan_id, name, start_date, end_date, test_groups
        )
        await self._cache.upsert_test_cycle(result, plan_id)
        return result

    # ---------- Test Runs ----------

    async def list_test_runs(self, cycle_id: int, use_cache: bool = True) -> list[dict[str, Any]]:
        """List test runs for a test cycle."""
        if use_cache:
            cached = await self._cache.get_test_runs(cycle_id)
            if cached:
                return cached

        runs = await self._api.get_test_runs(cycle_id)
        await self._cache.upsert_test_runs_batch(runs, cycle_id)
        return await self._cache.get_test_runs(cycle_id)

    async def get_test_run(self, run_id: int) -> dict[str, Any]:
        cached = await self._cache.get_test_run(run_id)
        if cached:
            return cached
        return await self._api.get_test_run(run_id)

    async def update_test_run_status(
        self,
        run_id: int,
        status: str,
        actual_results: str | None = None,
    ) -> dict[str, Any]:
        """Update a test run's status (and optionally actual results) on Jama, then refresh cache."""
        # Validate status
        try:
            TestRunStatus(status)
        except ValueError:
            valid = [s.value for s in TestRunStatus]
            raise ValueError(f"Invalid status '{status}'. Valid: {valid}")

        result = await self._api.update_test_run(run_id, status=status, actual_results=actual_results)

        # Refresh the cached run
        fresh = await self._api.get_test_run(run_id)
        # Find cycle_id from the response or cache
        cached = await self._cache.get_test_run(run_id)
        cycle_id = cached["test_cycle_id"] if cached else 0
        if cycle_id:
            await self._cache.upsert_test_run(fresh, cycle_id)

        return result

    # ---------- Summary ----------

    async def get_test_summary(self, cycle_id: int, use_cache: bool = True) -> TestSummary:
        """Get pass/fail/blocked/not_run summary for a test cycle."""
        runs = await self.list_test_runs(cycle_id, use_cache=use_cache)
        summary = TestSummary(total=len(runs))

        for run in runs:
            status = run.get("status", "NOT_RUN").upper()
            if status == "PASSED":
                summary.passed += 1
            elif status == "FAILED":
                summary.failed += 1
            elif status == "BLOCKED":
                summary.blocked += 1
            elif status == "INPROGRESS":
                summary.in_progress += 1
            else:
                summary.not_run += 1

        return summary

    async def get_plan_summary(self, plan_id: int) -> dict[str, Any]:
        """Get aggregated summary across all cycles in a test plan."""
        cycles = await self.list_test_cycles(plan_id)
        total_summary = TestSummary()
        cycle_summaries: list[dict[str, Any]] = []

        for cycle in cycles:
            cs = await self.get_test_summary(cycle["id"])
            total_summary.total += cs.total
            total_summary.passed += cs.passed
            total_summary.failed += cs.failed
            total_summary.blocked += cs.blocked
            total_summary.not_run += cs.not_run
            total_summary.in_progress += cs.in_progress
            cycle_summaries.append({
                "cycle_id": cycle["id"],
                "cycle_name": cycle.get("name", ""),
                "summary": cs.model_dump(),
            })

        return {
            "plan_id": plan_id,
            "total": total_summary.model_dump(),
            "cycles": cycle_summaries,
        }
