#!/usr/bin/env python
"""Add leave.types.* and leave.compOff.* i18n keys to all 9 locale JSONs.

Does textual surgery inside each file to preserve per-line encoding and minimize
git diff: finds the existing "leave" object, inserts the two new subtrees just
before its closing brace. All other keys are untouched.
"""
import json, os, re

base = os.path.join(os.path.dirname(__file__), "..", "packages", "client", "src", "locales")

LEAVE_TYPES = {
    "en": {"CL":"Casual Leave","EL":"Earned Leave","SL":"Sick Leave","ML":"Maternity Leave","PL":"Paternity Leave","COMP_OFF":"Compensatory Off","UNPAID":"Unpaid Leave","MARRIAGE":"Marriage Leave","BEREAVEMENT":"Bereavement Leave"},
    "es": {"CL":"Licencia por asuntos propios","EL":"Licencia acumulada","SL":"Licencia por enfermedad","ML":"Licencia de maternidad","PL":"Licencia de paternidad","COMP_OFF":"Descanso compensatorio","UNPAID":"Licencia sin goce de sueldo","MARRIAGE":"Licencia por matrimonio","BEREAVEMENT":"Licencia por luto"},
    "fr": {"CL":"Congé personnel","EL":"Congé acquis","SL":"Congé maladie","ML":"Congé maternité","PL":"Congé paternité","COMP_OFF":"Repos compensateur","UNPAID":"Congé sans solde","MARRIAGE":"Congé de mariage","BEREAVEMENT":"Congé de deuil"},
    "de": {"CL":"Gelegenheitsurlaub","EL":"Erworbener Urlaub","SL":"Krankheitsurlaub","ML":"Mutterschaftsurlaub","PL":"Vaterschaftsurlaub","COMP_OFF":"Freizeitausgleich","UNPAID":"Unbezahlter Urlaub","MARRIAGE":"Hochzeitsurlaub","BEREAVEMENT":"Trauerurlaub"},
    "pt": {"CL":"Licença pessoal","EL":"Licença adquirida","SL":"Licença médica","ML":"Licença-maternidade","PL":"Licença-paternidade","COMP_OFF":"Folga compensatória","UNPAID":"Licença sem vencimento","MARRIAGE":"Licença-casamento","BEREAVEMENT":"Licença por luto"},
    "ar": {"CL":"إجازة عارضة","EL":"إجازة مستحقة","SL":"إجازة مرضية","ML":"إجازة أمومة","PL":"إجازة أبوة","COMP_OFF":"إجازة تعويضية","UNPAID":"إجازة بدون راتب","MARRIAGE":"إجازة زواج","BEREAVEMENT":"إجازة وفاة"},
    "hi": {"CL":"आकस्मिक अवकाश","EL":"अर्जित अवकाश","SL":"बीमारी अवकाश","ML":"मातृत्व अवकाश","PL":"पितृत्व अवकाश","COMP_OFF":"क्षतिपूरक अवकाश","UNPAID":"अवैतनिक अवकाश","MARRIAGE":"विवाह अवकाश","BEREAVEMENT":"शोक अवकाश"},
    "ja": {"CL":"私用休暇","EL":"有給休暇","SL":"病気休暇","ML":"産休","PL":"育休","COMP_OFF":"代休","UNPAID":"無給休暇","MARRIAGE":"結婚休暇","BEREAVEMENT":"忌引休暇"},
    "zh": {"CL":"事假","EL":"年假","SL":"病假","ML":"产假","PL":"陪产假","COMP_OFF":"调休","UNPAID":"无薪假","MARRIAGE":"婚假","BEREAVEMENT":"丧假"},
}

COMP_OFF = {
    "en": {"title":"Compensatory Off","subtitle":"Request comp-off for working on holidays or weekends.","request":"Request Comp-Off","requestTitle":"Request Compensatory Off","balanceLabel":"Comp-Off Balance","usedOfAllocated":"{{used}} used of {{allocated}} allocated","pendingRequests":"Pending Requests","approvedRequests":"Approved Requests","myRequests":"My Requests","pendingApprovals":"Pending Approvals","dateWorked":"Date Worked","expiresOn":"Expires On","expiryHint":"Auto-set to 30 days from worked date","days":"Days","daysHalf":"Half Day (0.5)","daysFull":"Full Day (1)","days1_5":"1.5 Days","days2":"2 Days","reason":"Reason","reasonPlaceholder":"Describe why you worked on this day (e.g., holiday shift, weekend deployment)","cancel":"Cancel","submit":"Submit Request","submitFailed":"Failed to submit request","workedDate":"Worked Date","status":"Status","submitted":"Submitted","employee":"Employee","actions":"Actions","approve":"Approve","reject":"Reject","rejectionReason":"Rejection reason","confirmReject":"Confirm Reject","loading":"Loading...","noRequests":"No comp-off requests yet","noPending":"No pending comp-off requests","userHash":"User #{{id}}","statusPending":"pending","statusApproved":"approved","statusRejected":"rejected"},
    "es": {"title":"Descanso compensatorio","subtitle":"Solicita descanso compensatorio por trabajar en festivos o fines de semana.","request":"Solicitar compensatorio","requestTitle":"Solicitar descanso compensatorio","balanceLabel":"Saldo compensatorio","usedOfAllocated":"{{used}} usados de {{allocated}} asignados","pendingRequests":"Solicitudes pendientes","approvedRequests":"Solicitudes aprobadas","myRequests":"Mis solicitudes","pendingApprovals":"Aprobaciones pendientes","dateWorked":"Fecha trabajada","expiresOn":"Vence el","expiryHint":"Se establece automáticamente a 30 días desde la fecha trabajada","days":"Días","daysHalf":"Medio día (0.5)","daysFull":"Día completo (1)","days1_5":"1.5 días","days2":"2 días","reason":"Motivo","reasonPlaceholder":"Describe por qué trabajaste ese día (ej.: festivo, despliegue de fin de semana)","cancel":"Cancelar","submit":"Enviar solicitud","submitFailed":"No se pudo enviar la solicitud","workedDate":"Fecha trabajada","status":"Estado","submitted":"Enviado","employee":"Empleado","actions":"Acciones","approve":"Aprobar","reject":"Rechazar","rejectionReason":"Motivo del rechazo","confirmReject":"Confirmar rechazo","loading":"Cargando...","noRequests":"Aún no hay solicitudes de compensatorio","noPending":"No hay solicitudes compensatorias pendientes","userHash":"Usuario #{{id}}","statusPending":"pendiente","statusApproved":"aprobada","statusRejected":"rechazada"},
    "fr": {"title":"Repos compensateur","subtitle":"Demandez un repos compensateur pour le travail effectué les jours fériés ou le week-end.","request":"Demander un repos compensateur","requestTitle":"Demander un repos compensateur","balanceLabel":"Solde de repos compensateur","usedOfAllocated":"{{used}} utilisés sur {{allocated}} alloués","pendingRequests":"Demandes en attente","approvedRequests":"Demandes approuvées","myRequests":"Mes demandes","pendingApprovals":"Approbations en attente","dateWorked":"Date travaillée","expiresOn":"Expire le","expiryHint":"Défini automatiquement à 30 jours après la date travaillée","days":"Jours","daysHalf":"Demi-journée (0,5)","daysFull":"Journée complète (1)","days1_5":"1,5 jour","days2":"2 jours","reason":"Motif","reasonPlaceholder":"Décrivez pourquoi vous avez travaillé ce jour (ex : jour férié, déploiement de week-end)","cancel":"Annuler","submit":"Envoyer la demande","submitFailed":"Échec de l’envoi de la demande","workedDate":"Date travaillée","status":"Statut","submitted":"Soumis","employee":"Employé","actions":"Actions","approve":"Approuver","reject":"Refuser","rejectionReason":"Motif du refus","confirmReject":"Confirmer le refus","loading":"Chargement...","noRequests":"Aucune demande de repos compensateur pour le moment","noPending":"Aucune demande en attente","userHash":"Utilisateur n°{{id}}","statusPending":"en attente","statusApproved":"approuvée","statusRejected":"refusée"},
    "de": {"title":"Freizeitausgleich","subtitle":"Freizeitausgleich für Feiertags- oder Wochenendarbeit beantragen.","request":"Ausgleich anfordern","requestTitle":"Freizeitausgleich beantragen","balanceLabel":"Ausgleichsguthaben","usedOfAllocated":"{{used}} von {{allocated}} genutzt","pendingRequests":"Offene Anträge","approvedRequests":"Genehmigte Anträge","myRequests":"Meine Anträge","pendingApprovals":"Offene Freigaben","dateWorked":"Gearbeiteter Tag","expiresOn":"Gültig bis","expiryHint":"Automatisch 30 Tage nach dem gearbeiteten Datum","days":"Tage","daysHalf":"Halber Tag (0,5)","daysFull":"Ganzer Tag (1)","days1_5":"1,5 Tage","days2":"2 Tage","reason":"Grund","reasonPlaceholder":"Beschreiben Sie, warum Sie an diesem Tag gearbeitet haben (z. B. Feiertagsschicht, Wochenend-Deployment)","cancel":"Abbrechen","submit":"Antrag einreichen","submitFailed":"Antrag konnte nicht eingereicht werden","workedDate":"Arbeitstag","status":"Status","submitted":"Eingereicht","employee":"Mitarbeiter","actions":"Aktionen","approve":"Genehmigen","reject":"Ablehnen","rejectionReason":"Ablehnungsgrund","confirmReject":"Ablehnung bestätigen","loading":"Wird geladen...","noRequests":"Noch keine Ausgleichsanträge","noPending":"Keine offenen Anträge","userHash":"Benutzer #{{id}}","statusPending":"offen","statusApproved":"genehmigt","statusRejected":"abgelehnt"},
    "pt": {"title":"Folga compensatória","subtitle":"Solicite folga compensatória por trabalhar em feriados ou finais de semana.","request":"Solicitar folga","requestTitle":"Solicitar folga compensatória","balanceLabel":"Saldo de folga","usedOfAllocated":"{{used}} usados de {{allocated}} alocados","pendingRequests":"Solicitações pendentes","approvedRequests":"Solicitações aprovadas","myRequests":"Minhas solicitações","pendingApprovals":"Aprovações pendentes","dateWorked":"Data trabalhada","expiresOn":"Expira em","expiryHint":"Definido automaticamente para 30 dias após a data trabalhada","days":"Dias","daysHalf":"Meio dia (0,5)","daysFull":"Dia inteiro (1)","days1_5":"1,5 dias","days2":"2 dias","reason":"Motivo","reasonPlaceholder":"Descreva por que trabalhou neste dia (ex.: feriado, deploy de fim de semana)","cancel":"Cancelar","submit":"Enviar solicitação","submitFailed":"Falha ao enviar a solicitação","workedDate":"Data trabalhada","status":"Status","submitted":"Enviado","employee":"Funcionário","actions":"Ações","approve":"Aprovar","reject":"Rejeitar","rejectionReason":"Motivo da rejeição","confirmReject":"Confirmar rejeição","loading":"Carregando...","noRequests":"Nenhuma solicitação de folga ainda","noPending":"Nenhuma solicitação pendente","userHash":"Usuário #{{id}}","statusPending":"pendente","statusApproved":"aprovada","statusRejected":"rejeitada"},
    "ar": {"title":"إجازة تعويضية","subtitle":"اطلب إجازة تعويضية مقابل العمل في العطلات أو عطلات نهاية الأسبوع.","request":"طلب إجازة تعويضية","requestTitle":"طلب إجازة تعويضية","balanceLabel":"رصيد الإجازة التعويضية","usedOfAllocated":"مستخدم {{used}} من {{allocated}} مخصّص","pendingRequests":"طلبات قيد المراجعة","approvedRequests":"طلبات معتمدة","myRequests":"طلباتي","pendingApprovals":"الموافقات المعلقة","dateWorked":"تاريخ العمل","expiresOn":"ينتهي في","expiryHint":"يُحدّد تلقائيًا بعد 30 يومًا من تاريخ العمل","days":"الأيام","daysHalf":"نصف يوم (٠٫٥)","daysFull":"يوم كامل (١)","days1_5":"١٫٥ يوم","days2":"يومان","reason":"السبب","reasonPlaceholder":"وضّح سبب العمل في هذا اليوم","cancel":"إلغاء","submit":"إرسال الطلب","submitFailed":"فشل إرسال الطلب","workedDate":"تاريخ العمل","status":"الحالة","submitted":"مُرسل","employee":"الموظف","actions":"الإجراءات","approve":"موافقة","reject":"رفض","rejectionReason":"سبب الرفض","confirmReject":"تأكيد الرفض","loading":"جارٍ التحميل...","noRequests":"لا توجد طلبات إجازة تعويضية بعد","noPending":"لا توجد طلبات معلقة","userHash":"المستخدم #{{id}}","statusPending":"قيد الانتظار","statusApproved":"موافق عليها","statusRejected":"مرفوضة"},
    "hi": {"title":"क्षतिपूरक अवकाश","subtitle":"छुट्टियों या सप्ताहांत में काम करने के बदले क्षतिपूरक अवकाश का अनुरोध करें।","request":"क्षतिपूरक अनुरोध","requestTitle":"क्षतिपूरक अवकाश का अनुरोध","balanceLabel":"क्षतिपूरक शेष","usedOfAllocated":"{{allocated}} में से {{used}} उपयोग किए","pendingRequests":"लंबित अनुरोध","approvedRequests":"स्वीकृत अनुरोध","myRequests":"मेरे अनुरोध","pendingApprovals":"लंबित अनुमोदन","dateWorked":"कार्य की तिथि","expiresOn":"समाप्ति तिथि","expiryHint":"कार्य तिथि से 30 दिन बाद स्वतः सेट","days":"दिन","daysHalf":"आधा दिन (0.5)","daysFull":"पूरा दिन (1)","days1_5":"1.5 दिन","days2":"2 दिन","reason":"कारण","reasonPlaceholder":"बताएँ कि आपने इस दिन क्यों काम किया","cancel":"रद्द करें","submit":"अनुरोध भेजें","submitFailed":"अनुरोध भेजने में विफल","workedDate":"कार्य तिथि","status":"स्थिति","submitted":"सबमिट किया","employee":"कर्मचारी","actions":"कार्रवाई","approve":"स्वीकृत","reject":"अस्वीकार","rejectionReason":"अस्वीकार का कारण","confirmReject":"अस्वीकार की पुष्टि करें","loading":"लोड हो रहा है...","noRequests":"अभी कोई क्षतिपूरक अनुरोध नहीं","noPending":"कोई लंबित अनुरोध नहीं","userHash":"उपयोगकर्ता #{{id}}","statusPending":"लंबित","statusApproved":"स्वीकृत","statusRejected":"अस्वीकृत"},
    "ja": {"title":"代休","subtitle":"休日や週末の勤務に対する代休を申請します。","request":"代休を申請","requestTitle":"代休の申請","balanceLabel":"代休残高","usedOfAllocated":"{{allocated}} 日中 {{used}} 日使用済み","pendingRequests":"保留中の申請","approvedRequests":"承認済みの申請","myRequests":"自分の申請","pendingApprovals":"保留中の承認","dateWorked":"勤務日","expiresOn":"有効期限","expiryHint":"勤務日から30日後に自動設定","days":"日数","daysHalf":"半日 (0.5)","daysFull":"全日 (1)","days1_5":"1.5日","days2":"2日","reason":"理由","reasonPlaceholder":"この日に勤務した理由を記入してください","cancel":"キャンセル","submit":"申請を送信","submitFailed":"申請の送信に失敗しました","workedDate":"勤務日","status":"ステータス","submitted":"送信済み","employee":"従業員","actions":"操作","approve":"承認","reject":"却下","rejectionReason":"却下の理由","confirmReject":"却下を確定","loading":"読み込み中...","noRequests":"代休申請はまだありません","noPending":"保留中の申請はありません","userHash":"ユーザー #{{id}}","statusPending":"保留中","statusApproved":"承認済み","statusRejected":"却下済み"},
    "zh": {"title":"调休","subtitle":"为节假日或周末加班申请调休。","request":"申请调休","requestTitle":"申请调休","balanceLabel":"调休余额","usedOfAllocated":"已使用 {{used}} / 已分配 {{allocated}}","pendingRequests":"待审批","approvedRequests":"已批准","myRequests":"我的申请","pendingApprovals":"待审批","dateWorked":"加班日期","expiresOn":"到期日","expiryHint":"自动设为加班日后 30 天","days":"天数","daysHalf":"半天 (0.5)","daysFull":"全天 (1)","days1_5":"1.5 天","days2":"2 天","reason":"原因","reasonPlaceholder":"描述此日加班原因（例如：假日值班、周末部署）","cancel":"取消","submit":"提交申请","submitFailed":"提交失败","workedDate":"加班日期","status":"状态","submitted":"已提交","employee":"员工","actions":"操作","approve":"批准","reject":"拒绝","rejectionReason":"拒绝原因","confirmReject":"确认拒绝","loading":"加载中...","noRequests":"尚无调休申请","noPending":"无待审批申请","userHash":"用户 #{{id}}","statusPending":"待审批","statusApproved":"已批准","statusRejected":"已拒绝"},
}


def find_leave_block_end(raw: str) -> int:
    """Return the character index of the `}` that closes the top-level `leave`
    object, including position so caller can splice before it."""
    m = re.search(r'\n  "leave"\s*:\s*\{', raw)
    if not m:
        raise RuntimeError("no top-level `leave` key found")
    depth = 0
    i = m.end() - 1  # position of the `{`
    while i < len(raw):
        ch = raw[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
        elif ch == '"':
            # skip string contents (including escape sequences)
            i += 1
            while i < len(raw) and raw[i] != '"':
                if raw[i] == '\\':
                    i += 2
                    continue
                i += 1
        i += 1
    raise RuntimeError("unbalanced braces")


def render_subtree(key: str, obj: dict, indent_base: int) -> str:
    """Render a key:{...} subtree at the given indent depth using the
    repo's 2-space indent convention."""
    body_indent = " " * (indent_base + 2)
    pad = " " * indent_base
    lines = [f'{pad}"{key}": {{']
    items = list(obj.items())
    for idx, (k, v) in enumerate(items):
        # json.dumps escapes as needed and keeps ASCII characters literal
        line = f'{body_indent}"{k}": {json.dumps(v, ensure_ascii=False)}'
        if idx < len(items) - 1:
            line += ","
        lines.append(line)
    lines.append(f"{pad}}}")
    return "\n".join(lines)


for lang in LEAVE_TYPES.keys():
    path = os.path.join(base, f"{lang}.json")
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()

    # Sanity-check: both new subtrees absent
    if '"compOff"' in raw and '"types"' in raw:
        print(f"skip {lang}.json (already has leave.types + leave.compOff)")
        continue

    close_pos = find_leave_block_end(raw)
    # Find the text right before the closing brace. We want:
    # - Add comma to the last existing entry if missing
    # - Insert the two new subtrees indented to 4 spaces (same as other keys under leave)
    before = raw[:close_pos].rstrip()
    after = raw[close_pos:]

    # Ensure trailing comma on last existing entry
    if not before.endswith(","):
        before = before + ","

    new_blocks = (
        "\n"
        + render_subtree("types", LEAVE_TYPES[lang], indent_base=4)
        + ",\n"
        + render_subtree("compOff", COMP_OFF[lang], indent_base=4)
        + "\n  "  # align closing `  }` of leave block
    )

    # Preserve original indentation of closing brace
    new_raw = before + new_blocks + after.lstrip(" ")

    # Validate the result is still valid JSON
    json.loads(new_raw)

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_raw)
    print(f"wrote {lang}.json")
