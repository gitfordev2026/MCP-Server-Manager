import os
import sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR = os.path.join(os.path.dirname(BASE_DIR), "documents")

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def style_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(6)
    run = h.runs[0]
    if level == 1:
        run.font.size = Pt(18)
        run.font.color.rgb = RGBColor(30, 58, 138) # Deep Navy
        run.font.bold = True
    elif level == 2:
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(37, 99, 235) # Royal Blue
        run.font.bold = True
    elif level == 3:
        run.font.size = Pt(11.5)
        run.font.color.rgb = RGBColor(79, 70, 229) # Indigo
        run.font.bold = True
    return h

def create_styled_document(title, subtitle, doc_number):
    doc = Document()
    
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
        
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(10)
    title_p.paragraph_format.space_after = Pt(4)
    t_run = title_p.add_run(title)
    t_run.font.size = Pt(24)
    t_run.font.bold = True
    t_run.font.color.rgb = RGBColor(15, 23, 42)
    
    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(16)
    s_run = sub_p.add_run(subtitle)
    s_run.font.size = Pt(13)
    s_run.font.color.rgb = RGBColor(100, 116, 139)
    
    meta_table = doc.add_table(rows=4, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Document Ref:", doc_number),
        ("Version:", "1.0.0 (Air-Gapped Enterprise Edition)"),
        ("Date:", "July 2026"),
        ("Classification:", "Internal Technical & Operational Document"),
    ]
    for i, (k, v) in enumerate(meta_data):
        row = meta_table.rows[i]
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.0)
        c1.width = Inches(4.5)
        
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(k)
        r0.font.bold = True
        r0.font.size = Pt(9.5)
        r0.font.color.rgb = RGBColor(51, 65, 85)
        
        p1 = c1.paragraphs[0]
        r1 = p1.add_run(v)
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = RGBColor(15, 23, 42)
        
        set_cell_background(c0, "F8FAFC")
        set_cell_background(c1, "FFFFFF")
        set_cell_margins(c0, top=60, bottom=60, left=100, right=100)
        set_cell_margins(c1, top=60, bottom=60, left=100, right=100)
        
    doc.add_paragraph().paragraph_format.space_after = Pt(10)
    return doc

def add_table_data(doc, headers, data):
    table = doc.add_table(rows=len(data) + 1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    hdr_cells = table.rows[0].cells
    for j, h_text in enumerate(headers):
        hdr_cells[j].text = h_text
        set_cell_background(hdr_cells[j], "1E293B")
        set_cell_margins(hdr_cells[j], top=100, bottom=100, left=120, right=120)
        p = hdr_cells[j].paragraphs[0]
        for run in p.runs:
            run.font.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
            run.font.size = Pt(9.5)
            
    for i, row_data in enumerate(data):
        row_cells = table.rows[i + 1].cells
        bg_color = "F8FAFC" if i % 2 == 1 else "FFFFFF"
        for j, val in enumerate(row_data):
            row_cells[j].text = str(val)
            set_cell_background(row_cells[j], bg_color)
            set_cell_margins(row_cells[j], top=80, bottom=80, left=120, right=120)
            p = row_cells[j].paragraphs[0]
            for run in p.runs:
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(30, 41, 59)
                
    doc.add_paragraph().paragraph_format.space_after = Pt(10)

def add_callout(doc, text, title="NOTE"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.rows[0].cells[0]
    cell.width = Inches(6.5)
    set_cell_background(cell, "EFF6FF")
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    p = cell.paragraphs[0]
    r_title = p.add_run(f"📌 {title}: ")
    r_title.font.bold = True
    r_title.font.size = Pt(9.5)
    r_title.font.color.rgb = RGBColor(29, 78, 216)
    
    r_text = p.add_run(text)
    r_text.font.size = Pt(9.5)
    r_text.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(10)

# 1. RELEASE NOTES
def build_release_notes():
    doc = create_styled_document("Release Notes — v1.0.0", "Model Context Protocol (MCP) Server & API Management Platform", "REL-v1.0.0")
    
    style_heading(doc, "1. Executive Summary", 1)
    doc.add_paragraph(
        "We are pleased to announce the official release of MCP Server Manager v1.0.0. "
        "This enterprise-grade release provides a robust, air-gapped solution for registering, governing, and evaluating "
        "OpenAPI REST services and Model Context Protocol (MCP) tool servers with multi-modal LLM agents."
    )
    
    add_callout(doc, "This release is fully certified for 100% air-gapped environments without any external internet or public CDN dependencies.", "AIR-GAPPED COMPLIANCE")
    
    style_heading(doc, "2. Key Feature Highlights", 1)
    features = [
        ["Feature Module", "Description", "Status"],
        ["Database RBAC & Access Matrix", "Granular role-based access control matrix allowing admins to enable/disable features per role.", "Production Ready"],
        ["OpenAPI REST Auto-Discovery", "Auto-fetches openapi.json, extracts schemas, and exposes REST endpoints as agent tools.", "Production Ready"],
        ["Native MCP SSE Server Support", "Connects to external MCP servers over HTTP/SSE transports for tool discovery and execution.", "Production Ready"],
        ["Multi-Modal LLM Agent Engine", "Integrates local Ollama models with fast stream recovery and tool execution fallbacks.", "Production Ready"],
        ["Keycloak Single Sign-On (SSO)", "OpenID Connect (OIDC) with Authorization Code + PKCE flow and custom HTTP fallback.", "Production Ready"],
        ["Interactive API Explorer", "Air-gapped documentation suite with inline parameter inspection and offline Markdown rendering.", "Production Ready"],
    ]
    add_table_data(doc, features[0], features[1:])
    
    style_heading(doc, "3. Critical Bug Fixes & Hardening", 1)
    fixes = [
        ["Component", "Issue Addressed", "Resolution Summary"],
        ["Tool Registry", "Custom tool descriptions wiped on background catalog sync", "Updated main.py sync logic to preserve user-edited descriptions in PostgreSQL."],
        ["HTTP IP Clipboard", "TypeError: Cannot read properties of undefined (reading 'writeText')", "Implemented fallback copyToClipboard mechanism using temporary textarea execCommand."],
        ["Agent Fast Execution", "mcp_use connection hangs for 30+ seconds on SSE timeouts", "Wrapped agent execution in asyncio.wait_for with 4s timeout & raw LLM tool rescue."],
        ["PKCE Authentication", "TypeError: Cannot read properties of undefined (reading 'digest')", "Implemented pure JavaScript offline SHA-256 algorithm (sha256PureJs) in auth.ts."],
        ["Admin Control Panel", "Tools tab showing tool count but rendering empty list", "Fixed null-property coercion on tool method, path, and name attributes."],
        ["Playground UI", "Dark user message background on light mode theme", "Updated message bubble styling to vibrant blue gradient in light and dark modes."],
    ]
    add_table_data(doc, fixes[0], fixes[1:])
    
    style_heading(doc, "4. Deployment & System Requirements", 1)
    doc.add_paragraph("• Host Architecture: x86_64 / ARM64 Linux, Docker Engine 24.0+, Docker Compose v2+")
    doc.add_paragraph("• Container Stack: Next.js 15 Frontend (port 3000), FastAPI Backend (port 8000), Keycloak 26 (port 8080), PostgreSQL 17 (port 5432), Redis Alpine (port 6379), Ollama LLM (port 11434)")

    doc.save(os.path.join(DOCS_DIR, "Release_Notes_v1.0.0.docx"))

# 2. USER GUIDE
def build_user_guide():
    doc = create_styled_document("User Guide & Operations Manual", "Step-by-Step Operator & Administrator Field Guide", "MAN-UG-1.0")
    
    style_heading(doc, "1. Getting Started & Single Sign-On", 1)
    doc.add_paragraph("The MCP Server Manager application is accessible via web browser at http://10.196.167.176:3000. Authentication is secured via Keycloak OpenID Connect (OIDC).")
    doc.add_paragraph("1. Navigate to the login page and click 'Login with Keycloak'.")
    doc.add_paragraph("2. Enter your enterprise credentials (default admin user: admin / admin).")
    doc.add_paragraph("3. Upon authentication, you will be redirected to the main Dashboard.")

    style_heading(doc, "2. Exposing OpenAPI Applications", 1)
    doc.add_paragraph("To register a REST API application and automatically expose its endpoints as LLM agent tools:")
    doc.add_paragraph("1. Click 'Register App' in the top navigation bar.")
    doc.add_paragraph("2. Enter the Application Name, Base URL (e.g. http://10.196.167.176:5555), and OpenAPI path (/openapi.json).")
    doc.add_paragraph("3. Click 'Fetch APIs' to inspect and auto-sync endpoints into the Tool Registry.")

    style_heading(doc, "3. Testing Tools in the Playground", 1)
    doc.add_paragraph("The Playground allows operators to test how the LLM agent selects and executes tools:")
    doc.add_paragraph("1. Select an Ollama Model from the model dropdown.")
    doc.add_paragraph("2. Choose an Application Context to restrict tool access or select 'All Applications'.")
    doc.add_paragraph("3. Type your natural language query into the prompt input box (e.g. 'find details of student id 3').")
    doc.add_paragraph("4. Use the '🔄 Regenerate' or '✏️ Edit & Resend' buttons below message bubbles to refine prompts.")

    style_heading(doc, "4. Admin Governance & RBAC Access Matrix", 1)
    doc.add_paragraph("Administrators can govern feature permissions and user roles under the Admin Control Panel (/admin):")
    doc.add_paragraph("• RBAC Access Matrix: Toggle access to Playground, Chat, API Explorer, MCP Endpoints, and Admin Panel per role (super_admin, admin, operator, read_only).")
    doc.add_paragraph("• User Role Assignments: Reassign system roles to users via simple dropdown selectors.")
    doc.add_paragraph("• Tool & Endpoint Controls: Admin-enable, disable, or edit custom descriptions for endpoints.")

    doc.save(os.path.join(DOCS_DIR, "User_Guide_and_Operations_Manual.docx"))

# 3. SDD
def build_sdd():
    doc = create_styled_document("Software Design Document (SDD)", "Comprehensive System Architecture & Technical Specifications", "SDD-MCP-1.0")
    
    style_heading(doc, "1. Architecture Overview", 1)
    doc.add_paragraph(
        "The MCP Server Manager is built on a decoupled microservices architecture designed for air-gapped high-availability deployments. "
        "The system comprises a Next.js 15 frontend container, a FastAPI Python 3.11 backend container, PostgreSQL 17 primary database, "
        "Redis caching & state store, Keycloak identity manager, and a local Ollama LLM execution service."
    )
    
    components = [
        ["Container Service", "Technology Stack", "Port", "Role & Responsibilities"],
        ["mcp-frontend-dev", "Next.js 15, React 19, Tailwind CSS", "3000", "Responsive user interface, auth state management, streaming chat UI."],
        ["mcp-backend-dev", "FastAPI, Python 3.11, SQLAlchemy", "8000", "Tool catalog management, agent routing, OpenAPI parsing, RBAC enforcement."],
        ["keycloak", "Keycloak 26, Quarkus Engine", "8080", "OpenID Connect (OIDC) authentication, token issuance, user identity store."],
        ["langfuse_postgres", "PostgreSQL 17", "5432", "Relational database for servers, raw APIs, tools, endpoints, RBAC matrix, audit logs."],
        ["mcp-redis-dev", "Redis Alpine", "6380", "Distributed session storage, catalog caching, streaming event queues."],
        ["ollama", "Ollama LLM Server", "11434", "Local air-gapped inference server (gemma4:31b, llama3, qwen)."],
    ]
    add_table_data(doc, components[0], components[1:])

    style_heading(doc, "2. Database Schema & Object Data Model", 1)
    doc.add_paragraph("The persistent database layer utilizes SQLAlchemy ORM models backed by PostgreSQL 17:")
    
    models = [
        ["Model Class", "Table Name", "Key Columns & Constraints"],
        ["BaseURLModel", "raw_apis", "id, name (unique), url, openapi_path, sync_mode, registry_state, is_enabled"],
        ["ServerModel", "mcp_servers", "id, name (unique), url, domain_type, health_status, selected_tools"],
        ["MCPToolModel", "mcp_tools", "id, source_type, owner_id, name, method, path, description, is_enabled"],
        ["APIEndpointModel", "api_endpoints", "id, owner_id, method, path, description, exposed_to_mcp, exposure_approved"],
        ["FeatureAccessModel", "feature_access", "id, role_name, feature_key, is_allowed (unique: role_name + feature_key)"],
        ["UserRoleAssignmentModel", "user_role_assignments", "id, username (unique), role_name"],
        ["AuditLogModel", "audit_logs", "id, actor, action, resource_type, resource_id, before_state, after_state, created_on"],
    ]
    add_table_data(doc, models[0], models[1:])

    style_heading(doc, "3. Security & Authentication Architecture", 1)
    doc.add_paragraph(
        "Authentication uses OAuth 2.0 / OpenID Connect (OIDC) Code Flow with PKCE (Proof Key for Code Exchange). "
        "For non-secure HTTP IP origins where Web Crypto APIs are restricted by browsers, PKCE challenges are computed "
        "via a 100% pure JavaScript SHA-256 implementation (sha256PureJs) in auth.ts."
    )

    doc.save(os.path.join(DOCS_DIR, "Software_Design_Document_SDD.docx"))

# 4. SRS
def build_srs():
    doc = create_styled_document("Software Requirements Specification (SRS)", "Functional, Non-Functional, and Interface Requirements", "SRS-MCP-1.0")
    
    style_heading(doc, "1. Functional Requirements", 1)
    reqs = [
        ["REQ-ID", "Module", "Requirement Specification", "Priority"],
        ["FR-01", "Tool Catalog", "The system shall automatically parse OpenAPI specs and register REST paths as usable tools.", "High"],
        ["FR-02", "MCP Transport", "The system shall establish SSE / HTTP stream connections to remote MCP servers.", "High"],
        ["FR-03", "Agent Execution", "The LLM agent shall evaluate natural language queries, extract arguments, and invoke target tools.", "High"],
        ["FR-04", "Parameter Rules", "The agent prompt shall inject full OpenAPI Request Schemas and prompt users for missing required fields.", "High"],
        ["FR-05", "User RBAC", "The system shall enforce feature-level permissions per role and enable dynamic admin configuration.", "High"],
        ["FR-06", "SSO Auth", "The application shall support Keycloak OpenID Connect authentication with offline PKCE fallback.", "Medium"],
        ["FR-07", "Audit Trail", "All administrative mutations (creates, updates, deletes, toggles) shall record an audit log entry.", "Medium"],
    ]
    add_table_data(doc, reqs[0], reqs[1:])

    style_heading(doc, "2. Non-Functional Requirements", 1)
    doc.add_paragraph("• NFR-01 (Air-Gapped Operation): The system MUST operate without internet connectivity or CDN downloads.")
    doc.add_paragraph("• NFR-02 (Performance): Tool execution stream turnaround time shall be less than 4.0 seconds.")
    doc.add_paragraph("• NFR-03 (Availability): Container restart resilience with persistent PostgreSQL and Redis state.")
    doc.add_paragraph("• NFR-04 (Usability): Responsive dark/light theme support with automatic input focus and copy fallbacks.")

    doc.save(os.path.join(DOCS_DIR, "Software_Requirements_Specification_SRS.docx"))

# 5. DDD
def build_ddd():
    doc = create_styled_document("Domain-Driven Design (DDD) Document", "Strategic Domain Analysis, Bounded Contexts & Aggregate Models", "DDD-MCP-1.0")
    
    style_heading(doc, "1. Strategic Domain Analysis & Bounded Contexts", 1)
    doc.add_paragraph("The MCP Server Manager application is organized into four core Bounded Contexts:")
    
    contexts = [
        ["Bounded Context", "Ubiquitous Language Terms", "Responsibilities"],
        ["Tool & API Catalog Context", "ToolDefinition, OpenAPI Spec, CatalogSync, RawAPI", "Parses OpenAPI specs, extracts request/response schemas, manages tool registry."],
        ["Agent Execution Context", "AgentQuery, ToolCall, SchemaValidation, StreamChunk", "Constructs LLM prompts, executes tools, enforces parameter rules, streams responses."],
        ["IAM & Access Control Context", "Role, FeatureAccess, UserRoleAssignment, Permission", "Manages Keycloak tokens, RBAC permission matrix, user-to-role mappings."],
        ["Governance & Audit Context", "AuditLog, HealthStatus, SyncError, RegistryState", "Tracks sync health, consecutive failures, records immutable audit trails."],
    ]
    add_table_data(doc, contexts[0], contexts[1:])

    style_heading(doc, "2. Ubiquitous Language Dictionary", 1)
    doc.add_paragraph("• Tool: An executable API unit (OpenAPI path or MCP tool) with defined input schema.")
    doc.add_paragraph("• Feature Access Matrix: A mapping of System Roles to Feature Keys controlling module permissions.")
    doc.add_paragraph("• Air-Gapped Mode: Operation mode wherein external network calls are blocked and fallback tools are invoked locally.")

    doc.save(os.path.join(DOCS_DIR, "Domain_Driven_Design_DDD.docx"))

if __name__ == "__main__":
    os.makedirs(DOCS_DIR, exist_ok=True)
    print(f"Generating documents in {DOCS_DIR}...")
    build_release_notes()
    build_user_guide()
    build_sdd()
    build_srs()
    build_ddd()
    print("All documents successfully generated in .docx format!")
