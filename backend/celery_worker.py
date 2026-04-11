import os
from celery import Celery
from celery.exceptions import Ignore
import auth
import oci_connector
from schemas import NewHostRequest

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("oci_docgen_worker", broker=REDIS_URL, backend=REDIS_URL)


def _resolve_profile(profile_id):
    if not profile_id:
        return None
    return auth.get_tenancy_profile(profile_id, decrypt_key=True)


class _ProgressProxy:
    """Wraps a Celery task and scales its 0-100 progress updates into a
    sub-range of the overall progress (used for per-compartment scaling)."""

    def __init__(self, task, base, range_):
        self._task = task
        self._base = base
        self._range = range_

    def update_state(self, state, meta):
        if state == "PROGRESS" and meta:
            scaled = self._base + int(meta.get("current", 0) / 100 * self._range)
            meta = {**meta, "current": scaled, "total": 100}
        self._task.update_state(state=state, meta=meta)


@celery_app.task(name="collect_full_infrastructure_task", bind=True)
def collect_full_infrastructure_task(self, region, compartments, doc_type, include_standalone=True, profile_id=None):
    """Collects full infrastructure data across one or more compartments.

    Args:
        compartments: list of {"id": ..., "name": ...} dicts, or a single
                      compartment_id string for backwards compatibility.
    """
    # Backwards compatibility: accept a bare string (single compartment)
    if isinstance(compartments, str):
        compartments = [{"id": compartments, "name": "N/A"}]

    profile = _resolve_profile(profile_id)
    n = len(compartments)

    if n == 1:
        # Single compartment — no proxy needed, direct call
        comp = compartments[0]
        try:
            return oci_connector.get_infrastructure_details(
                self, region, comp["id"], doc_type,
                include_standalone=include_standalone, profile=profile,
            ).dict()
        except PermissionError as e:
            self.update_state(
                state="IAM_ERROR",
                meta={"error": str(e), "error_type": "IAM_PERMISSION"},
            )
            raise Ignore()

    # Multi-compartment flow
    all_results = []
    for idx, comp in enumerate(compartments):
        outer_pct = int((idx / n) * 90)
        self.update_state(state="PROGRESS", meta={
            "current": outer_pct, "total": 100,
            "step_key": "progress.collecting_compartment",
            "context": {"name": comp["name"], "current": idx + 1, "total": n},
        })
        proxy = _ProgressProxy(self, base=outer_pct, range_=max(1, int(90 / n)))
        try:
            result = oci_connector.get_infrastructure_details(
                proxy, region, comp["id"], doc_type,
                include_standalone=include_standalone, profile=profile,
            )
            result = oci_connector.tag_compartment(result, comp["id"], comp["name"])
            all_results.append((comp, result))
        except PermissionError as e:
            self.update_state(
                state="IAM_ERROR",
                meta={"error": str(e), "error_type": "IAM_PERMISSION"},
            )
            raise Ignore()

    self.update_state(state="PROGRESS", meta={
        "current": 95, "total": 100,
        "step_key": "progress.merging_compartments", "context": {},
    })
    merged = oci_connector.merge_infrastructure_data(all_results)
    return merged.dict()


@celery_app.task(name="collect_new_host_task", bind=True)
def collect_new_host_task(self, region, request_dict, doc_type, profile_id=None):
    profile = _resolve_profile(profile_id)
    try:
        req = NewHostRequest(**request_dict)
        return oci_connector.get_new_host_details(
            self, region=region, compartment_id=req.compartment_id,
            compartment_name=req.compartment_name, instance_ids=req.instance_ids,
            doc_type=doc_type, profile=profile,
        ).dict()
    except PermissionError as e:
        self.update_state(
            state="IAM_ERROR",
            meta={"error": str(e), "error_type": "IAM_PERMISSION"},
        )
        raise Ignore()


@celery_app.task(name="collect_waf_report_task", bind=True)
def collect_waf_report_task(self, region, compartment_id, compartment_name, profile_id=None):
    profile = _resolve_profile(profile_id)
    try:
        return oci_connector.get_waf_report_details(
            self, region, compartment_id, compartment_name, profile=profile,
        ).dict()
    except PermissionError as e:
        self.update_state(
            state="IAM_ERROR",
            meta={"error": str(e), "error_type": "IAM_PERMISSION"},
        )
        raise Ignore()


@celery_app.task(name="collect_database_task", bind=True)
def collect_database_task(self, region, compartment_id, compartment_name, profile_id=None):
    """Collects Database (DBaaS) data from a single compartment."""
    profile = _resolve_profile(profile_id)
    try:
        return oci_connector.get_database_details(
            self, region, compartment_id, compartment_name, profile=profile,
        ).dict()
    except PermissionError as e:
        self.update_state(
            state="IAM_ERROR",
            meta={"error": str(e), "error_type": "IAM_PERMISSION"},
        )
        raise Ignore()
