# OCI DocGen
# Author: Pedro Teixeira
# Date: September 29, 2025
# Description: Defines Celery tasks for long-running OCI data collection processes.

# --- Third-Party Imports ---
from celery import Celery

# --- Local Application Imports ---
import oci_connector
from schemas import NewHostRequest

# --- Celery Application Configuration ---
celery_app = Celery(
    "oci_docgen_worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
)


# --- Celery Task Definitions ---
@celery_app.task(name="collect_full_infrastructure_task", bind=True)
def collect_full_infrastructure_task(
    self, region: str, compartment_id: str, doc_type: str
):
    """
    Celery task to run the comprehensive infrastructure data collection in the background.
    """
    infra_details = oci_connector.get_infrastructure_details(
        self, region, compartment_id, doc_type
    )
    return infra_details.dict()


@celery_app.task(name="collect_new_host_task", bind=True)
def collect_new_host_task(self, region: str, request_dict: dict, doc_type: str):
    """
    Celery task to run the 'New Host' data collection in the background.
    """
    request_data = NewHostRequest(**request_dict)

    infra_details = oci_connector.get_new_host_details(
        self,
        region=region,
        compartment_id=request_data.compartment_id,
        compartment_name=request_data.compartment_name,
        instance_ids=request_data.instance_ids,
        doc_type=doc_type,
    )
    return infra_details.dict()