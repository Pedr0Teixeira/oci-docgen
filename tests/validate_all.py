#!/usr/bin/env python3
"""
validate_all.py — OCI DocGen Comprehensive Automated Validation

Tests:
  1. Backend doc generation for every doc_type (full_infra, database, kubernetes,
     waf_report, new_host) in both languages (pt / en) with rich mock data.
  2. Frontend locale completeness: extracts every t('key') call from app.js and
     confirms each key exists in both en.json and pt.json.
  3. Summary title i18n: verifies the summary.title.* keys exist for every doc type
     that the frontend can display.

Usage (from repo root or tests/):
  python tests/validate_all.py

No OCI credentials required — all data is mocked.
"""

import io
import json
import os
import re
import sys
import traceback

# ---------------------------------------------------------------------------
# Path setup — allow running from repo root, tests/, or inside the container
# ---------------------------------------------------------------------------

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT   = os.path.dirname(SCRIPT_DIR)
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
FRONTEND_DIR = os.path.join(REPO_ROOT, "frontend")

# When running inside the Docker container the script is at /app/validate_all.py
# and there is no /frontend directory. Detect and adjust paths accordingly.
_INSIDE_CONTAINER = os.path.isfile("/app/main.py")
if _INSIDE_CONTAINER:
    BACKEND_DIR  = "/app"
    # Locales are copied alongside the script for container runs
    FRONTEND_DIR = "/app/frontend_assets"

sys.path.insert(0, BACKEND_DIR)

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}✗{RESET} {msg}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}⚠{RESET} {msg}")


def section(title: str) -> None:
    print(f"\n{BOLD}{CYAN}━━━ {title} ━━━{RESET}")


# ---------------------------------------------------------------------------
# Results accumulator
# ---------------------------------------------------------------------------

_results: list[dict] = []  # {"group", "name", "passed", "detail"}


def record(group: str, name: str, passed: bool, detail: str = "") -> None:
    _results.append({"group": group, "name": name, "passed": passed, "detail": detail})
    if passed:
        ok(f"{name}")
    else:
        fail(f"{name}" + (f" — {detail}" if detail else ""))


# ===========================================================================
# SECTION 1 — MOCK DATA FACTORY
# ===========================================================================

def make_infra_data():
    """Build a rich InfrastructureData mock covering every schema field."""
    from schemas import (
        InfrastructureData, InstanceData, BlockVolume, SecurityList, SecurityRule,
        NetworkSecurityGroup, RouteTable, RouteRule, VcnData, SubnetData, LpgData,
        DrgData, DrgAttachmentData, RpcData, CpeData, IpsecData, TunnelData,
        PhaseOneDetails, PhaseTwoDetails, BgpSessionInfo, LoadBalancerData,
        LoadBalancerIpAddressData, ListenerData, BackendSetData, BackendData,
        HealthCheckerData, HostnameData, VolumeGroupData, VolumeGroupValidation,
        OkeClusterData, NodePoolData, WafPolicyData, WafAction, WafAccessControlRule,
        WafProtectionRule, WafProtectionCapability, WafRateLimitingRule,
        WafFirewallData, WafIntegrationData, WafNetworkInfrastructure,
        DbSystemData, DbHomeData, DatabaseData, DbNodeData, DbBackupConfigData,
        DbBackupData, DataGuardAssociationData, StandaloneVolumeData, CompartmentRef,
    )

    # --- Security rules
    ingress_rule = SecurityRule(
        direction="INGRESS", protocol="TCP",
        source_or_destination="0.0.0.0/0", ports="443",
        description="Allow HTTPS"
    )
    egress_rule = SecurityRule(
        direction="EGRESS", protocol="all",
        source_or_destination="0.0.0.0/0", ports="all",
        description="Allow all egress"
    )
    sec_list = SecurityList(
        id="ocid1.securitylist.mock.1",
        name="Mock-SecurityList",
        rules=[ingress_rule, egress_rule]
    )
    nsg = NetworkSecurityGroup(
        id="ocid1.nsg.mock.1",
        name="Mock-NSG",
        rules=[ingress_rule]
    )
    route_rule_igw = RouteRule(
        destination="0.0.0.0/0",
        target="ocid1.internetgateway.mock",
        description="Default route via IGW"
    )
    route_rule_drg = RouteRule(
        destination="10.0.0.0/8",
        target="ocid1.drg.mock.1",
        description="Route to on-prem via DRG"
    )
    route_table = RouteTable(
        id="ocid1.routetable.mock.1",
        name="Mock-RouteTable",
        rules=[route_rule_igw, route_rule_drg]
    )

    # --- Subnets & LPGs
    subnet_pub = SubnetData(
        id="ocid1.subnet.mock.pub",
        display_name="Public-Subnet",
        cidr_block="10.0.1.0/24",
        route_table_id="ocid1.routetable.mock.1",
        route_table_name="Mock-RouteTable",
        security_list_ids=["ocid1.securitylist.mock.1"],
        security_list_names=["Mock-SecurityList"],
        prohibit_public_ip_on_vnic=False
    )
    subnet_priv = SubnetData(
        id="ocid1.subnet.mock.priv",
        display_name="Private-Subnet",
        cidr_block="10.0.2.0/24",
        route_table_id="ocid1.routetable.mock.1",
        route_table_name="Mock-RouteTable",
        security_list_ids=["ocid1.securitylist.mock.1"],
        security_list_names=["Mock-SecurityList"],
        prohibit_public_ip_on_vnic=True
    )
    lpg_same = LpgData(
        id="ocid1.lpg.mock.1",
        display_name="LPG-SameTenancy",
        lifecycle_state="AVAILABLE",
        peering_status="PEERED",
        peering_status_details="Peer route accessible",
        peer_id="ocid1.lpg.peer.1",
        route_table_id="ocid1.routetable.mock.1",
        peer_advertised_cidr="192.168.0.0/16",
        is_cross_tenancy_peering=False,
        route_table_name="Mock-RouteTable",
        peer_vcn_name="Peer-VCN",
        peer_compartment_name="Peer-Compartment"
    )
    lpg_cross = LpgData(
        id="ocid1.lpg.mock.2",
        display_name="LPG-CrossTenancy",
        lifecycle_state="AVAILABLE",
        peering_status="PEERED",
        peering_status_details="Connected to a peer",
        peer_id="ocid1.lpg.external.abcdefgh1234567890",
        route_table_id="ocid1.routetable.mock.1",
        peer_advertised_cidr="172.16.0.0/12",
        is_cross_tenancy_peering=True,
        route_table_name="Mock-RouteTable",
        peer_vcn_name="External-VCN",
        peer_compartment_name="External-Compartment"
    )
    vcn = VcnData(
        id="ocid1.vcn.mock.1",
        display_name="Mock-VCN",
        cidr_block="10.0.0.0/16",
        subnets=[subnet_pub, subnet_priv],
        security_lists=[sec_list],
        route_tables=[route_table],
        network_security_groups=[nsg],
        lpgs=[lpg_same, lpg_cross],
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )

    # --- Block volumes + instance
    bv = BlockVolume(
        id="ocid1.volume.mock.1",
        display_name="Mock-BlockVolume",
        size_in_gbs=100.0,
        backup_policy_name="Silver"
    )
    instance = InstanceData(
        host_name="mock-server-01",
        lifecycle_state="RUNNING",
        shape="VM.Standard.E4.Flex",
        ocpus="4",
        memory="64",
        os_name="Oracle Linux 8.8",
        boot_volume_gb="50",
        boot_volume_id="ocid1.bootvolume.mock.1",
        private_ip="10.0.1.10",
        public_ip="203.0.113.5",
        backup_policy_name="Gold",
        block_volumes=[bv],
        security_lists=[sec_list],
        network_security_groups=[nsg],
        route_table=route_table,
        compartment_name="Mock-Compartment",
        compartment_id="ocid1.compartment.mock",
        subnet_id="ocid1.subnet.mock.pub",
        subnet_name="Public-Subnet",
        vcn_id="ocid1.vcn.mock.1"
    )

    # --- DRG
    drg_attach = DrgAttachmentData(
        id="ocid1.drgattachment.mock.1",
        display_name="VCN-Attachment",
        network_id="ocid1.vcn.mock.1",
        network_type="VCN",
        route_table_id="ocid1.routetable.mock.1",
        route_table_name="Mock-RouteTable"
    )
    rpc = RpcData(
        id="ocid1.rpc.mock.1",
        display_name="Mock-RPC",
        lifecycle_state="AVAILABLE",
        peering_status="PEERED",
        peering_status_details="Connected to peer region",
        peer_region_name="us-phoenix-1"
    )
    drg = DrgData(
        id="ocid1.drg.mock.1",
        display_name="Mock-DRG",
        attachments=[drg_attach],
        rpcs=[rpc],
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )

    # --- CPE + IPSec
    cpe = CpeData(
        id="ocid1.cpe.mock.1",
        display_name="Mock-CPE",
        ip_address="198.51.100.1",
        vendor="Cisco",
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )
    ph1 = PhaseOneDetails(
        is_custom=False,
        authentication_algorithm="SHA2_256",
        encryption_algorithm="AES_256_CBC",
        dh_group="GROUP14",
        lifetime_in_seconds=28800
    )
    ph2 = PhaseTwoDetails(
        is_custom=False,
        authentication_algorithm="HMAC_SHA2_256_128",
        encryption_algorithm="AES_256_CBC",
        lifetime_in_seconds=3600
    )
    bgp = BgpSessionInfo(
        oracle_bgp_asn="31898",
        customer_bgp_asn="65000",
        oracle_interface_ip="169.254.0.1/30",
        customer_interface_ip="169.254.0.2/30"
    )
    tunnel = TunnelData(
        id="ocid1.ipsectunnel.mock.1",
        display_name="Tunnel-1",
        status="UP",
        cpe_ip="198.51.100.1",
        vpn_oracle_ip="203.0.113.10",
        routing_type="BGP",
        ike_version="V2",
        validation_status="OK",
        validation_details="All checks passed",
        phase_one_details=ph1,
        phase_two_details=ph2,
        bgp_session_info=bgp
    )
    ipsec = IpsecData(
        id="ocid1.ipsec.mock.1",
        display_name="Mock-IPSec",
        status="UP",
        cpe_id="ocid1.cpe.mock.1",
        drg_id="ocid1.drg.mock.1",
        static_routes=["10.100.0.0/16"],
        tunnels=[tunnel],
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )

    # --- Load Balancer
    hc = HealthCheckerData(protocol="HTTP", port=80, url_path="/health")
    backend = BackendData(name="backend-1:8080", ip_address="10.0.2.10", port=8080, weight=1)
    backend_set = BackendSetData(
        name="backend-set-1",
        policy="ROUND_ROBIN",
        health_checker=hc,
        backends=[backend]
    )
    listener = ListenerData(
        name="listener-https",
        protocol="HTTPS",
        port=443,
        default_backend_set_name="backend-set-1",
        hostname_names=["api.mockapp.com"]
    )
    hostname = HostnameData(name="api.mockapp.com")
    lb_ip = LoadBalancerIpAddressData(ip_address="203.0.113.100", is_public=True)
    lb = LoadBalancerData(
        id="ocid1.loadbalancer.mock.1",
        subnet_ids=["ocid1.subnet.mock.pub"],
        display_name="Mock-LB",
        lifecycle_state="ACTIVE",
        shape_name="flexible",
        ip_addresses=[lb_ip],
        listeners=[listener],
        backend_sets=[backend_set],
        hostnames=[hostname],
        waf_firewall_id="ocid1.webappfirewall.mock.1",
        waf_firewall_name="Mock-WAF-Firewall",
        waf_policy_id="ocid1.webappfirewallpolicy.mock.1",
        waf_policy_name="Mock-WAF-Policy",
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )

    # --- Volume Group
    vg_validation = VolumeGroupValidation(
        has_backup_policy=True,
        policy_name="Gold",
        is_cross_region_replication_enabled=True,
        cross_region_target="us-phoenix-1"
    )
    vg = VolumeGroupData(
        id="ocid1.volumegroup.mock.1",
        display_name="Mock-VolumeGroup",
        availability_domain="AD-1",
        lifecycle_state="AVAILABLE",
        members=["Mock-BlockVolume"],
        member_ids=["ocid1.volume.mock.1"],
        validation=vg_validation,
        compartment_name="Mock-Compartment"
    )

    # --- OKE
    node_pool = NodePoolData(
        name="NodePool-1",
        kubernetes_version="v1.28.2",
        shape="VM.Standard.E4.Flex",
        ocpus=4,
        memory_in_gbs=64,
        os_image="Oracle Linux 8",
        node_count=3,
        subnet_name="Private-Subnet",
        boot_volume_size_in_gbs=100
    )
    oke = OkeClusterData(
        id="ocid1.cluster.mock.1",
        name="Mock-OKE-Cluster",
        kubernetes_version="v1.28.2",
        vcn_id="ocid1.vcn.mock.1",
        vcn_name="Mock-VCN",
        public_api_endpoint="https://203.0.113.200:6443",
        private_api_endpoint="10.0.1.100",
        lb_subnet_name="Public-Subnet",
        nodes_subnet_name="Private-Subnet",
        node_pools=[node_pool],
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )

    # --- WAF
    waf_action = WafAction(name="ALLOW", type="ALLOW")
    waf_action_block = WafAction(name="BLOCK", type="RETURN_HTTP_RESPONSE", code=403)
    ac_rule = WafAccessControlRule(
        name="block-bad-ips",
        action_name="BLOCK",
        condition="i_contains(connection.source_ip, ['1.2.3.4'])",
        condition_language="JMESPATH"
    )
    waf_cap = WafProtectionCapability(key="941100", version=1, action_name="BLOCK")
    prot_rule = WafProtectionRule(
        name="owasp-crs",
        action_name="BLOCK",
        condition=None,
        is_body_inspection_enabled=True,
        protection_capabilities=[waf_cap]
    )
    rate_rule = WafRateLimitingRule(
        name="rate-limit-api",
        action_name="BLOCK",
        condition="i_startsWith(http.request.uri.path, '/api/')"
    )
    waf_fw = WafFirewallData(
        id="ocid1.webappfirewall.mock.1",
        display_name="Mock-WAF-Firewall",
        backend_type="LOAD_BALANCER",
        load_balancer_id="ocid1.loadbalancer.mock.1"
    )
    waf_net = WafNetworkInfrastructure(
        vcn_name="Mock-VCN",
        vcn_cidr="10.0.0.0/16",
        subnet_name="Public-Subnet",
        subnet_cidr="10.0.1.0/24"
    )
    waf_integration = WafIntegrationData(firewall=waf_fw, load_balancer=lb)
    waf_policy = WafPolicyData(
        id="ocid1.webappfirewallpolicy.mock.1",
        display_name="Mock-WAF-Policy",
        compartment_name="Mock-Compartment",
        lifecycle_state="ACTIVE",
        region="sa-saopaulo-1",
        time_created="2024-01-15T10:00:00.000Z",
        actions=[waf_action, waf_action_block],
        access_control_rules=[ac_rule],
        protection_rules=[prot_rule],
        rate_limiting_rules=[rate_rule],
        integration=waf_integration,
        integrations=[waf_integration],
        network_infrastructure=waf_net
    )

    # --- Database
    backup_config = DbBackupConfigData(
        auto_backup_enabled=True,
        auto_backup_window="SLOT_TWO",
        auto_full_backup_window="SLOT_THREE",
        auto_full_backup_day="SUNDAY",
        recovery_window_in_days=30,
        backup_destination="OBJECT_STORE",
        backup_destination_details=[],
        backup_deletion_policy="DELETE_IMMEDIATELY",
        run_immediate_full_backup=False
    )
    dg_assoc = DataGuardAssociationData(
        id="ocid1.dataguardassociation.mock.1",
        role="PRIMARY",
        peer_role="STANDBY",
        peer_database_id="ocid1.database.peer.1",
        peer_db_system_id="ocid1.dbsystem.peer.1",
        protection_mode="MAXIMUM_PERFORMANCE",
        transport_type="ASYNC",
        apply_lag="0 seconds",
        apply_rate="1 MB/s",
        lifecycle_state="AVAILABLE"
    )
    db_backup = DbBackupData(
        id="ocid1.dbbackup.mock.1",
        display_name="Mock-Backup-2024",
        type="FULL",
        lifecycle_state="ACTIVE",
        lifecycle_details=None,
        backup_destination_type="OBJECT_STORE",
        time_started="2024-01-20T02:00:00.000Z",
        time_ended="2024-01-20T03:30:00.000Z",
        database_size_in_gbs=120.5,
        shape="VM.Standard2.4",
        database_edition="ENTERPRISE_EDITION"
    )
    database = DatabaseData(
        id="ocid1.database.mock.1",
        db_name="MOCKDB",
        db_unique_name="MOCKDB_sa1",
        pdb_name="MOCKPDB",
        sid_prefix="MOCK",
        is_cdb=True,
        lifecycle_state="AVAILABLE",
        character_set="AL32UTF8",
        ncharacter_set="AL16UTF16",
        db_workload="OLTP",
        connection_strings={"cdbDefault": "MOCKDB_sa1.subnet.vcn.oraclevcn.com:1521/MOCKDB"},
        backup_config=backup_config,
        kms_key_id=None,
        vault_id=None,
        last_backup_timestamp="2024-01-20T03:30:00.000Z",
        last_backup_duration_in_seconds=5400,
        last_failed_backup_timestamp=None,
        time_created="2024-01-01T00:00:00.000Z",
        backups=[db_backup],
        data_guard_associations=[dg_assoc]
    )
    db_home = DbHomeData(
        id="ocid1.dbhome.mock.1",
        display_name="Mock-DBHome",
        db_version="19.21.0.0.0",
        lifecycle_state="AVAILABLE",
        db_home_location="/u01/app/oracle/product/19.0.0.0/dbhome_1",
        time_created="2024-01-01T00:00:00.000Z",
        databases=[database]
    )
    db_node = DbNodeData(
        id="ocid1.dbnode.mock.1",
        hostname="mock-db-node-1",
        lifecycle_state="AVAILABLE",
        private_ip="10.0.2.20",
        fault_domain="FAULT-DOMAIN-1",
        vnic_id="ocid1.vnic.mock.1",
        software_storage_size_in_gb=200,
        time_created="2024-01-01T00:00:00.000Z"
    )
    db_system = DbSystemData(
        id="ocid1.dbsystem.mock.1",
        display_name="Mock-DBSystem",
        lifecycle_state="AVAILABLE",
        shape="VM.Standard2.4",
        cpu_core_count=4,
        memory_size_in_gbs=60,
        data_storage_size_in_gbs=256,
        reco_storage_size_in_gb=256,
        data_storage_percentage=80,
        storage_volume_performance_mode="BALANCED",
        storage_management="ASM",
        disk_redundancy="HIGH",
        node_count=1,
        database_edition="ENTERPRISE_EDITION",
        license_model="LICENSE_INCLUDED",
        version="19.21.0.0.0",
        os_version="Oracle Linux Server release 7.9",
        hostname="mock-db-node-1",
        domain="subnet.vcn.oraclevcn.com",
        cluster_name=None,
        availability_domain="AD-1",
        fault_domains=["FAULT-DOMAIN-1"],
        listener_port=1521,
        scan_dns_name="mock-scan.subnet.vcn.oraclevcn.com",
        scan_ip_ids=["ocid1.scanip.mock.1"],
        vip_ids=["ocid1.vip.mock.1"],
        time_zone="UTC",
        time_created="2024-01-01T00:00:00.000Z",
        nsg_ids=[],
        ssh_public_keys_count=1,
        vcn_id="ocid1.vcn.mock.1",
        vcn_name="Mock-VCN",
        subnet_id="ocid1.subnet.mock.priv",
        subnet_name="Private-Subnet",
        backup_subnet_id="ocid1.subnet.mock.backup",
        backup_subnet_name="Backup-Subnet",
        db_nodes=[db_node],
        db_homes=[db_home],
        compartment_id="ocid1.compartment.mock",
        compartment_name="Mock-Compartment"
    )

    # --- Standalone volume
    standalone_vol = StandaloneVolumeData(
        id="ocid1.volume.standalone.1",
        display_name="Standalone-Volume",
        size_in_gbs=200.0,
        lifecycle_state="AVAILABLE",
        backup_policy_name="Bronze",
        availability_domain="AD-2",
        compartment_name="Mock-Compartment"
    )

    # --- Compartment ref
    comp_ref = CompartmentRef(id="ocid1.compartment.mock", name="Mock-Compartment")

    return InfrastructureData(
        instances=[instance],
        vcns=[vcn],
        drgs=[drg],
        cpes=[cpe],
        ipsec_connections=[ipsec],
        load_balancers=[lb],
        volume_groups=[vg],
        kubernetes_clusters=[oke],
        waf_policies=[waf_policy],
        db_systems=[db_system],
        certificates=[],
        standalone_volumes=[standalone_vol],
        compartments=[comp_ref]
    )


# ===========================================================================
# SECTION 2 — BACKEND DOC GENERATION TESTS
# ===========================================================================

def test_doc_generation():
    section("Backend — Document Generation")

    try:
        from doc_generator import generate_documentation
        from schemas import InfrastructureData
    except ImportError as e:
        fail(f"Cannot import doc_generator or schemas: {e}")
        return

    infra = make_infra_data()

    doc_types = ["full_infra", "database", "kubernetes", "waf_report", "new_host"]
    languages = ["pt", "en"]

    for doc_type in doc_types:
        for lang in languages:
            label = f"doc_type={doc_type!r}  lang={lang!r}"
            try:
                result = generate_documentation(
                    doc_type=doc_type,
                    infra_data=infra,
                    responsible_name="Validator Script",
                    lang=lang,
                    compartment_name="Mock-Compartment"
                )
                # generate_documentation returns the output file path (str)
                if result and os.path.isfile(result) and os.path.getsize(result) > 1000:
                    record("doc_generation", label, True)
                elif result and isinstance(result, str) and not os.path.isfile(result):
                    record("doc_generation", label, False,
                           f"Returned path does not exist: {result}")
                else:
                    record("doc_generation", label, False,
                           f"File too small or empty: {result!r}")
            except Exception as e:
                record("doc_generation", label, False, str(e))
                print(f"    {RED}Traceback:{RESET}")
                for line in traceback.format_exc().splitlines():
                    print(f"      {line}")


# ===========================================================================
# SECTION 3 — LOCALE COMPLETENESS CHECK
# ===========================================================================

def _load_locale(lang: str) -> dict:
    path = os.path.join(FRONTEND_DIR, "locales", f"{lang}.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_t_keys(js_source: str) -> set:
    """
    Extract all string literals used as first argument to t('...') or t("...").
    Matches patterns like:  t('some.key')  t("some.key")  t(`some.key`)
    Also handles:  t('some.key', {...})  t('some.key', 'fallback')
    Skips keys that are clearly variable references (no dot and not starting with a letter).
    """
    pattern = re.compile(r"""\bt\(\s*['"`]([a-zA-Z][a-zA-Z0-9._\-]*)['"`]""")
    keys = set(pattern.findall(js_source))
    # Remove "dynamic prefix" keys that end with '.' — these come from patterns like
    # t('ann.type.' + variable) where the literal captured is only the prefix part.
    keys = {k for k in keys if not k.endswith('.')}
    return keys


def test_locale_completeness():
    section("Frontend — Locale Key Completeness")

    # Load locale files
    try:
        en = _load_locale("en")
        pt = _load_locale("pt")
    except Exception as e:
        fail(f"Cannot load locale files: {e}")
        return

    record("locale_load", "en.json loads OK", True)
    record("locale_load", "pt.json loads OK", True)

    # Read app.js
    app_js_path = os.path.join(FRONTEND_DIR, "js", "app.js")
    try:
        with open(app_js_path, "r", encoding="utf-8") as f:
            app_js = f.read()
    except Exception as e:
        fail(f"Cannot read app.js: {e}")
        return

    keys_in_app = _extract_t_keys(app_js)
    record("locale_extract", f"Extracted {len(keys_in_app)} unique t() keys from app.js", True)

    missing_en = []
    missing_pt = []
    for key in sorted(keys_in_app):
        if key not in en:
            missing_en.append(key)
        if key not in pt:
            missing_pt.append(key)

    if missing_en:
        for key in missing_en:
            record("locale_en", f"en.json missing key: {key!r}", False)
    else:
        record("locale_en", f"All {len(keys_in_app)} app.js keys present in en.json", True)

    if missing_pt:
        for key in missing_pt:
            record("locale_pt", f"pt.json missing key: {key!r}", False)
    else:
        record("locale_pt", f"All {len(keys_in_app)} app.js keys present in pt.json", True)

    # Also check diagram.js
    diagram_js_path = os.path.join(FRONTEND_DIR, "js", "diagram.js")
    try:
        with open(diagram_js_path, "r", encoding="utf-8") as f:
            diagram_js = f.read()
        diagram_keys = _extract_t_keys(diagram_js)
        record("locale_extract", f"Extracted {len(diagram_keys)} unique keys from diagram.js", True)
        diag_missing_en = [k for k in sorted(diagram_keys) if k not in en]
        diag_missing_pt = [k for k in sorted(diagram_keys) if k not in pt]
        if diag_missing_en:
            for key in diag_missing_en:
                record("locale_en_diagram", f"en.json missing diagram.js key: {key!r}", False)
        else:
            record("locale_en_diagram", f"All {len(diagram_keys)} diagram.js keys present in en.json", True)
        if diag_missing_pt:
            for key in diag_missing_pt:
                record("locale_pt_diagram", f"pt.json missing diagram.js key: {key!r}", False)
        else:
            record("locale_pt_diagram", f"All {len(diagram_keys)} diagram.js keys present in pt.json", True)
    except Exception as e:
        warn(f"Could not check diagram.js: {e}")


# ===========================================================================
# SECTION 4 — SUMMARY TITLE KEYS
# ===========================================================================

def test_summary_title_keys():
    section("Frontend — Summary Title Keys")

    try:
        en = _load_locale("en")
        pt = _load_locale("pt")
    except Exception as e:
        fail(f"Cannot load locale files: {e}")
        return

    # These are the doc types that map to summary.title.* in app.js
    expected_title_keys = {
        "summary.title.full_infra",
        "summary.title.new_host",
        "summary.title.k8s",
        "summary.title.waf",
        "summary.title.database",
    }

    for key in sorted(expected_title_keys):
        in_en = key in en
        in_pt = key in pt
        if in_en and in_pt:
            record("summary_titles", f"{key} present in EN + PT", True)
        else:
            langs_missing = []
            if not in_en: langs_missing.append("en.json")
            if not in_pt: langs_missing.append("pt.json")
            record("summary_titles", f"{key} MISSING in {', '.join(langs_missing)}", False)

    # Spot-check the values look right (not empty, contain {name} placeholder)
    for key in sorted(expected_title_keys):
        for lang, locale_dict in [("en", en), ("pt", pt)]:
            val = locale_dict.get(key, "")
            if val and "{name}" in val:
                record("summary_title_values", f"{key} [{lang}] has {{name}} placeholder", True)
            elif val:
                record("summary_title_values", f"{key} [{lang}] missing {{name}} placeholder", False,
                       f"value={val!r}")
            else:
                record("summary_title_values", f"{key} [{lang}] is empty or missing", False)


# ===========================================================================
# SECTION 5 — SCHEMA INSTANTIATION SMOKE TEST
# ===========================================================================

def test_schema_instantiation():
    section("Backend — Schema Instantiation (Pydantic models)")

    try:
        infra = make_infra_data()
    except Exception as e:
        fail(f"make_infra_data() raised an exception: {e}")
        traceback.print_exc()
        return

    checks = [
        ("instances", len(infra.instances) > 0),
        ("vcns", len(infra.vcns) > 0),
        ("drgs", len(infra.drgs) > 0),
        ("cpes", len(infra.cpes) > 0),
        ("ipsec_connections", len(infra.ipsec_connections) > 0),
        ("load_balancers", len(infra.load_balancers) > 0),
        ("volume_groups", len(infra.volume_groups) > 0),
        ("kubernetes_clusters", len(infra.kubernetes_clusters) > 0),
        ("waf_policies", len(infra.waf_policies) > 0),
        ("db_systems", len(infra.db_systems) > 0),
        ("standalone_volumes", len(infra.standalone_volumes) > 0),
        ("compartments", len(infra.compartments) > 0),
        ("instance.block_volumes", len(infra.instances[0].block_volumes) > 0),
        ("instance.security_lists", len(infra.instances[0].security_lists) > 0),
        ("vcn.subnets", len(infra.vcns[0].subnets) == 2),
        ("vcn.lpgs", len(infra.vcns[0].lpgs) == 2),
        ("vcn.route_tables", len(infra.vcns[0].route_tables) > 0),
        ("vcn.network_security_groups", len(infra.vcns[0].network_security_groups) > 0),
        ("drg.attachments", len(infra.drgs[0].attachments) > 0),
        ("drg.rpcs", len(infra.drgs[0].rpcs) > 0),
        ("ipsec.tunnels", len(infra.ipsec_connections[0].tunnels) > 0),
        ("ipsec.tunnel.bgp_session_info", infra.ipsec_connections[0].tunnels[0].bgp_session_info is not None),
        ("lb.listeners", len(infra.load_balancers[0].listeners) > 0),
        ("lb.backend_sets", len(infra.load_balancers[0].backend_sets) > 0),
        ("lb.ip_addresses", len(infra.load_balancers[0].ip_addresses) > 0),
        ("oke.node_pools", len(infra.kubernetes_clusters[0].node_pools) > 0),
        ("waf.actions", len(infra.waf_policies[0].actions) > 0),
        ("waf.access_control_rules", len(infra.waf_policies[0].access_control_rules) > 0),
        ("waf.protection_rules", len(infra.waf_policies[0].protection_rules) > 0),
        ("waf.rate_limiting_rules", len(infra.waf_policies[0].rate_limiting_rules) > 0),
        ("waf.integration", infra.waf_policies[0].integration is not None),
        ("waf.network_infrastructure", infra.waf_policies[0].network_infrastructure is not None),
        ("db.db_systems", len(infra.db_systems) > 0),
        ("db.db_nodes", len(infra.db_systems[0].db_nodes) > 0),
        ("db.db_homes", len(infra.db_systems[0].db_homes) > 0),
        ("db.databases", len(infra.db_systems[0].db_homes[0].databases) > 0),
        ("db.backup_config", infra.db_systems[0].db_homes[0].databases[0].backup_config is not None),
        ("db.backups", len(infra.db_systems[0].db_homes[0].databases[0].backups) > 0),
        ("db.data_guard", len(infra.db_systems[0].db_homes[0].databases[0].data_guard_associations) > 0),
        ("lpg_same_tenancy", not infra.vcns[0].lpgs[0].is_cross_tenancy_peering),
        ("lpg_cross_tenancy", infra.vcns[0].lpgs[1].is_cross_tenancy_peering),
    ]

    for name, passed in checks:
        record("schema", name, passed)


# ===========================================================================
# SECTION 6 — DOC_STRINGS COVERAGE
# ===========================================================================

def test_doc_strings_coverage():
    section("Backend — DOC_STRINGS bilingual coverage")

    try:
        import doc_generator as dg
    except ImportError as e:
        fail(f"Cannot import doc_generator: {e}")
        return

    doc_strings = getattr(dg, "DOC_STRINGS", None)
    if doc_strings is None:
        fail("DOC_STRINGS not found in doc_generator")
        return

    langs = list(doc_strings.keys())
    record("doc_strings", f"Languages defined: {langs}", set(langs) == {"pt", "en"})

    # Check that both languages have the same set of keys
    if "pt" in doc_strings and "en" in doc_strings:
        pt_keys = set(doc_strings["pt"].keys())
        en_keys = set(doc_strings["en"].keys())
        only_pt = pt_keys - en_keys
        only_en = en_keys - pt_keys
        if only_pt:
            for k in sorted(only_pt):
                record("doc_strings_parity", f"Key only in PT: {k!r}", False)
        if only_en:
            for k in sorted(only_en):
                record("doc_strings_parity", f"Key only in EN: {k!r}", False)
        if not only_pt and not only_en:
            record("doc_strings_parity",
                   f"PT and EN have same {len(pt_keys)} keys", True)


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  OCI DocGen — Comprehensive Automated Validation{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")

    test_schema_instantiation()
    test_doc_generation()
    test_locale_completeness()
    test_summary_title_keys()
    test_doc_strings_coverage()

    # --- Summary
    section("Results Summary")
    total   = len(_results)
    passed  = sum(1 for r in _results if r["passed"])
    failed  = total - passed

    by_group: dict[str, list] = {}
    for r in _results:
        by_group.setdefault(r["group"], []).append(r)

    for group, items in by_group.items():
        g_pass = sum(1 for r in items if r["passed"])
        g_total = len(items)
        colour = GREEN if g_pass == g_total else RED
        print(f"  {colour}{group}: {g_pass}/{g_total}{RESET}")

    print()
    if failed == 0:
        print(f"{GREEN}{BOLD}  All {total} checks passed! ✓{RESET}")
    else:
        print(f"{RED}{BOLD}  {failed}/{total} checks FAILED ✗{RESET}")
        print()
        print(f"{RED}  Failed checks:{RESET}")
        for r in _results:
            if not r["passed"]:
                print(f"    {RED}✗{RESET} [{r['group']}] {r['name']}" +
                      (f"\n       → {r['detail']}" if r["detail"] else ""))

    print()
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
