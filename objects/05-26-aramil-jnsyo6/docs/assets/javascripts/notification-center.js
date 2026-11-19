/* 05 26 Aramil — request-only UI. No WB commands, no secrets, no implicit deployment. */
(() => {
  "use strict";
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = String(text);
    return n;
  };
  const prettyDate = iso => new Date(iso).toLocaleString("ru-RU", {dateStyle:"long",timeStyle:"short",timeZone:"Europe/Moscow"});
  const statusText = s => s === "existing" ? "Уже реализовано" : "Требует внедрения";
  const severityText = s => ({critical:"Критическое",error:"Ошибка",info:"Информация"})[s] || s;
  const makeId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10);
  };
  const append = (parent, ...nodes) => nodes.forEach(node => parent.appendChild(node));
  async function mount() {
    const root = document.getElementById("notification-center");
    if (!root || root.dataset.initialized) return;
    root.dataset.initialized = "true";
    const catalogUrl = new URL("../assets/notification-catalog.json", window.location.href);
    let catalog;
    try {
      const response = await fetch(catalogUrl, {cache:"no-store"});
      if (!response.ok) throw new Error("HTTP " + response.status);
      catalog = await response.json();
      if (!Array.isArray(catalog.rules) || !Array.isArray(catalog.sections)) throw new Error("Неподдерживаемый формат каталога");
    } catch (error) {
      root.textContent = "Не удалось загрузить реестр уведомлений: " + error.message;
      return;
    }
    const state = new Map(catalog.rules.map(rule => [rule.event_id, {
      email_customer: !!rule.currently_emails_customer,
      delta_c: rule.kind === "below_setpoint" ? catalog.default_delta_c : null,
      hold_minutes: rule.kind === "below_setpoint" ? catalog.default_hold_minutes : null,
      notify_recovery: true
    }]));
    let activeSection = "rooms";
    const header = el("div","nc-header");
    append(header,el("h2","","Выберите уведомления"),el("p","","Какие события системы вы хотите получать на почту? Варианты ниже формируют заявку инженеру и не меняют оборудование автоматически."));
    const status = el("div","nc-status");
    status.textContent = "Последний MQTT-снимок: " + prettyDate(catalog.snapshot_at) +
      ". Текущие значения и уставки могут отличаться. Действующие email-правила определены по проверенным скриптам 12.11.2026.";
    const nav = el("div","nc-tabs");
    nav.setAttribute("role","tablist");
    const panel = el("div","nc-panel");
    const summary = el("p","nc-summary");
    const preview = el("pre","nc-preview");
    preview.hidden = true;
    const footer = el("div","nc-footer");
    const accessRow = el("div","nc-access");
    const accessLabel = el("label","","Код доступа для отправки заявки");
    const access = el("input","nc-input");
    access.type = "password"; access.autocomplete = "off"; access.placeholder = "Выдаётся NEIROLINKS";
    accessLabel.appendChild(access);
    const accessHint = el("span","nc-muted","Код используется только при отправке; не сохраняется в браузере.");
    append(accessRow,accessLabel,accessHint);
    if (!catalog.api_url) accessRow.hidden = true;
    const buttons = el("div","nc-buttons");
    const diffButton = el("button","md-button nc-button","Проверить изменения");
    diffButton.type = "button";
    const downloadButton = el("button","md-button nc-button nc-secondary","Скачать JSON");
    downloadButton.type = "button";
    const submitButton = el("button","md-button nc-button nc-primary","Отправить изменения");
    submitButton.type = "button";
    append(buttons,diffButton,downloadButton,submitButton);
    const feedback = el("div","nc-feedback");
    feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
    append(footer,summary,accessRow,buttons,feedback,preview);
    append(root,header,status,nav,panel,footer);
    const changedRules = () => catalog.rules.filter(r => state.get(r.event_id).email_customer !== !!r.currently_emails_customer);
    const changedParameters = () => catalog.rules.filter(r => {
      const s=state.get(r.event_id);
      return r.kind === "below_setpoint" && s.email_customer &&
        (s.delta_c !== catalog.default_delta_c || s.hold_minutes !== catalog.default_hold_minutes || !s.notify_recovery);
    });
    const updateSummary = () => {
      const selected = [...state.values()].filter(s => s.email_customer).length;
      const planned = catalog.rules.filter(r => r.rule_status === "planned" && state.get(r.event_id).email_customer).length;
      summary.textContent = "Выбрано: " + selected + " из " + catalog.rules.length +
        ". Изменено галочек: " + changedRules().length +
        (planned ? ". Новых правил к реализации: " + planned : "") + ".";
    };
    const mkCheckbox = (r) => {
      const label = el("label","nc-event");
      const check = el("input");
      check.type = "checkbox";
      check.checked = state.get(r.event_id).email_customer;
      check.setAttribute("aria-label","Отправлять email: " + r.title);
      check.addEventListener("change", () => {
        state.get(r.event_id).email_customer = check.checked;
        preview.hidden = true; feedback.textContent = "";
        updateSummary();
      });
      const body = el("span","nc-event-body");
      const title = el("strong","",r.title);
      const badges = el("span","nc-badges");
      const severity = el("span","nc-severity nc-severity-"+r.severity,severityText(r.severity));
      const stage = el("span","nc-stage"+(r.rule_status === "planned" ? " nc-pending" : ""),statusText(r.rule_status));
      append(badges,severity,stage);
      append(body,title,badges);
      if (r.description) append(body,el("span","nc-description",r.description));
      if (r.kind === "below_setpoint") {
        const node = el("span","nc-settings");
        const delta = el("input","nc-number");
        delta.type = "number";delta.min = "1";delta.max = "10";delta.step="1";delta.value = String(state.get(r.event_id).delta_c);
        delta.setAttribute("aria-label","Отклонение в °C для "+r.title);
        const hold = el("input","nc-number");
        hold.type = "number";hold.min="0";hold.max="120";hold.step="1";hold.value=String(state.get(r.event_id).hold_minutes);
        hold.setAttribute("aria-label","Выдержка в минутах для "+r.title);
        delta.addEventListener("change",()=>{state.get(r.event_id).delta_c = Number(delta.value); preview.hidden=true;});
        hold.addEventListener("change",()=>{state.get(r.event_id).hold_minutes = Number(hold.value); preview.hidden=true;});
        append(node,el("span","","Допуск, °C"),delta,el("span","","Выдержка, мин"),hold);
        append(body,node);
        if (!r.setpoint_verified) append(body,el("span","nc-warning","Уставка пока не подтверждена; выбор будет заявкой на разработку."));
      }
      append(label,check,body);
      return label;
    };
    const draw = () => {
      nav.replaceChildren();panel.replaceChildren();
      for (const s of catalog.sections) {
        const b=el("button","nc-tab"+(s.id===activeSection?" nc-tab-active":""),s.title);
        b.type="button";b.setAttribute("role","tab");b.setAttribute("aria-selected",s.id===activeSection?"true":"false");
        b.addEventListener("click",()=>{activeSection=s.id;draw();});
        nav.appendChild(b);
      }
      const section = catalog.sections.find(s=>s.id===activeSection);
      append(panel,el("h3","",section.title),el("p","nc-muted",section.description));
      const rows=catalog.rules.filter(r=>r.section===activeSection);
      if (activeSection==="events") {
        for (const severity of ["critical","error","info"]) {
          const group=rows.filter(r=>r.severity===severity);
          if (!group.length) continue;
          panel.appendChild(el("h4","nc-group-title",severityText(severity)));
          const list=el("div","nc-list");
          for(const r of group) list.appendChild(mkCheckbox(r));
          panel.appendChild(list);
        }
      } else {
        const list=el("div","nc-list");
        for(const r of rows) list.appendChild(mkCheckbox(r));
        panel.appendChild(list);
      }
    };
    const buildRequest = () => ({
      schema_version:"1.0",
      request_id: makeId(),
      request_type:"notification_policy_change",
      object_id:catalog.object_id,
      baseline_revision:catalog.baseline_revision,
      requested_at:new Date().toISOString(),
      engineering_setpoints_change:false,
      rules:catalog.rules.map(r=>({
        event_id:r.event_id,
        email_customer:state.get(r.event_id).email_customer,
        ...(r.kind==="below_setpoint" ? {
          delta_c:state.get(r.event_id).delta_c,
          hold_minutes:state.get(r.event_id).hold_minutes,
          notify_recovery:state.get(r.event_id).notify_recovery
        }:{})
      }))
    });
    const validate = req => {
      if (changedRules().length===0 && changedParameters().length===0) {
        throw new Error("Нет изменений для отправки.");
      }
      for (const r of req.rules) {
        if ("delta_c" in r && (!Number.isInteger(r.delta_c)||r.delta_c<1||r.delta_c>10))
          throw new Error("Допуск должен быть целым числом от 1 до 10 °C.");
        if ("hold_minutes" in r && (!Number.isInteger(r.hold_minutes)||r.hold_minutes<0||r.hold_minutes>120))
          throw new Error("Выдержка должна быть целым числом от 0 до 120 минут.");
      }
      return req;
    };
    const check = () => validate(buildRequest());
    diffButton.addEventListener("click",()=>{
      feedback.textContent="";
      try {
        const req=check();
        preview.textContent = JSON.stringify(req,null,2);
        preview.hidden = false;
      } catch(e) { feedback.textContent=e.message; preview.hidden=true; }
    });
    downloadButton.addEventListener("click",()=>{
      feedback.textContent="";
      try {
        const req=check();
        const blob=new Blob([JSON.stringify(req,null,2)+"\n"],{type:"application/json;charset=utf-8"});
        const link=document.createElement("a");
        link.href=URL.createObjectURL(blob);link.download="aramil-notifications-"+req.request_id+".json";
        document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(link.href),1000);
        feedback.textContent="JSON сформирован. Это заявка, а не применённые настройки.";
      } catch(e){feedback.textContent=e.message;}
    });
    submitButton.addEventListener("click",async()=>{
      feedback.textContent="";
      let req;
      try { req=check(); } catch(e) { feedback.textContent=e.message;return;}
      if (!catalog.api_url) {
        feedback.textContent="Сервис приёма заявок пока не подключён. Скачайте JSON и передайте инженеру вручную.";
        return;
      }
      if (!access.value) {feedback.textContent="Введите код доступа.";return;}
      submitButton.disabled=true;
      try {
        const response=await fetch(catalog.api_url,{
          method:"POST",mode:"cors",credentials:"omit",
          headers:{"Content-Type":"application/json","X-Customer-Key":access.value},
          body:JSON.stringify(req)
        });
        let receipt={};try{receipt=await response.json();}catch(_){}
        if(!response.ok||!receipt.request_id)throw new Error(receipt.detail||"HTTP "+response.status);
        feedback.textContent="Заявка получена: "+receipt.request_id+". Ожидает рассмотрения инженером; на контроллере ничего не изменено.";
      }catch(e){feedback.textContent="Отправка не подтверждена: "+e.message;}
      finally{submitButton.disabled=false;}
    });
    draw();updateSummary();
  }
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
})();
