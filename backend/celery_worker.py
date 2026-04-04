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


@celery_app.task(name="collect_full_infrastructure_task", bind=True)
def collect_full_infrastructure_task(self, region, compartment_id, doc_type, include_standalone=True, profile_id=None):
    profile = _resolve_profile(profile_id)
    try:
        return oci_connector.get_infrastructure_details(
            self, region, compartment_id, doc_type,
            include_standalone=include_standalone, profile=profile,
        ).dict()
    except PermissionError as e:
        self.update_state(
            state="IAM_ERROR",
            meta={"error": str(e), "error_type": "IAM_PERMISSION"},
        )
        raise Ignore()


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