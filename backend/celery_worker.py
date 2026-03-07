# ==============================================================================
# PT-BR: Worker Celery da aplicação OCI DocGen.
#        Registra e executa as tarefas assíncronas de coleta de dados da OCI,
#        isolando o processamento pesado do servidor FastAPI.
# EN: Celery worker for the OCI DocGen application.
#     Registers and executes asynchronous OCI data collection tasks,
#     isolating heavy processing from the FastAPI server.
# ==============================================================================

from celery import Celery

import oci_connector
from schemas import NewHostRequest


# ==============================================================================
# PT-BR: Configuração do Celery com Redis como broker e backend de resultados.
#        O Redis deve estar rodando localmente na porta padrão 6379.
# EN: Celery configuration using Redis as both broker and result backend.
#     Redis must be running locally on the default port 6379.
# ==============================================================================

celery_app = Celery(
    "oci_docgen_worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
)


# ==============================================================================
# PT-BR: Definição das Tarefas Celery
# EN: Celery Task Definitions
# ==============================================================================

@celery_app.task(name="collect_full_infrastructure_task", bind=True)
def collect_full_infrastructure_task(self, region: str, compartment_id: str, doc_type: str):
    """
    PT-BR: Coleta completa de infraestrutura (instâncias, VCNs, LBs, OKE, etc.)
           para um compartimento. Utilizado pelos fluxos de documentação completa.
    EN: Full infrastructure collection (instances, VCNs, LBs, OKE, etc.)
        for a compartment. Used by full documentation flows.
    """
    infra_data = oci_connector.get_infrastructure_details(self, region, compartment_id, doc_type)
    return infra_data.dict()


@celery_app.task(name="collect_new_host_task", bind=True)
def collect_new_host_task(self, region: str, request_dict: dict, doc_type: str):
    """
    PT-BR: Coleta de dados de instâncias específicas para o fluxo de Novo Host.
           Recebe uma lista de OCIDs de instâncias e coleta apenas os dados relevantes.
    EN: Data collection for specific instances in the New Host flow.
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
    PT-BR: Coleta de dados para o relatório de WAF, incluindo políticas, firewalls,
           Load Balancers integrados, VCNs relevantes e certificados do compartimento.
    EN: Data collection for the WAF report, including policies, firewalls,
        integrated Load Balancers, relevant VCNs, and compartment certificates.
    """
    infra_data = oci_connector.get_waf_report_details(self, region, compartment_id, compartment_name)
    return infra_data.dict()