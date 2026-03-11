# ==============================================================================
# celery_worker.py — Celery task definitions for OCI DocGen.
#     Registers and executes asynchronous OCI data collection tasks,
#     isolating heavy OCI API processing from the FastAPI server.
# ==============================================================================

from celery import Celery

import oci_connector
from schemas import NewHostRequest


# ==============================================================================

celery_app = Celery(
    "oci_docgen_worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
)


# ==============================================================================

@celery_app.task(name="collect_full_infrastructure_task", bind=True)
def collect_full_infrastructure_task(self, region: str, compartment_id: str, doc_type: str, include_standalone: bool = True):
    """
    Full infrastructure collection (instances, VCNs, LBs, OKE, WAF, DRG, VPN, etc.)
    for a compartment. Used by the full_infra and kubernetes documentation flows.
    """
    infra_data = oci_connector.get_infrastructure_details(self, region, compartment_id, doc_type, include_standalone=include_standalone)
    return infra_data.dict()


@celery_app.task(name="collect_new_host_task", bind=True)
def collect_new_host_task(self, region: str, request_dict: dict, doc_type: str):
    """
    Data collection for specific instances in the New Host flow.
    Receives a list of instance OCIDs and collects only the relevant data.
    """
    request_data = NewHostRequest(**request_dict)
    infra_data = oci_connector.get_new_host_details(
        self,
        region=region,
        compartment_id=request_data.compartment_id,
        compartment_name=request_data.compartment_name,
        instance_ids=request_data.instance_ids,
        doc_type=doc_type,
    )
    return infra_data.dict()


@celery_app.task(name="collect_waf_report_task", bind=True)
def collect_waf_report_task(self, region: str, compartment_id: str, compartment_name: str):
    """
    Data collection for the WAF report: policies, firewalls,
    integrated Load Balancers, relevant VCNs, and compartment certificates.
    """
    infra_data = oci_connector.get_waf_report_details(self, region, compartment_id, compartment_name)
    return infra_data.dict()