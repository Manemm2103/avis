const state = {
  token: "",
  currentUser: null,
  status: "open",
  search: "",
  deliveryDate: "",
  deliveryWeek: "",
  tour: "",
  driverPhoneId: "",
  orders: [],
  drivers: [],
  tours: [],
  filterTours: [],
  filterWeeks: [],
  users: [],
  sqlSettings: null,
  ldapSettings: null,
  mailSettings: null,
  sort: {
    key: "",
    direction: "asc"
  },
  masterdataPage: "drivers",
  bulkSelectedOrderNumbers: new Set(),
  bulkLastSelectedOrderNumber: "",
  selectedOrder: null,
  notifySelectedOrder: false,
  confirmResolve: null,
  toastTimer: null
};

const elements = {
  loginView: document.querySelector("#login-view"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  appShell: document.querySelector("#app-shell"),
  currentUser: document.querySelector("#current-user"),
  logoutButton: document.querySelector("#logout-button"),
  tabs: {
    orders: document.querySelector("#tab-orders"),
    import: document.querySelector("#tab-import"),
    masterdata: document.querySelector("#tab-masterdata")
  },
  views: {
    orders: document.querySelector("#orders-view"),
    import: document.querySelector("#import-view"),
    masterdata: document.querySelector("#masterdata-view")
  },
  masterdataTabs: document.querySelectorAll("[data-masterdata-tab]"),
  masterdataPanels: document.querySelectorAll("[data-masterdata-panel]"),
  ordersTable: document.querySelector("#orders-table"),
  ordersBody: document.querySelector("#orders-body"),
  notifiedAtHeader: document.querySelector("#notified-at-header"),
  driversBody: document.querySelector("#drivers-body"),
  usersBody: document.querySelector("#users-body"),
  searchInput: document.querySelector("#search-input"),
  filterDate: document.querySelector("#filter-date"),
  filterWeekButton: document.querySelector("#filter-week-button"),
  filterWeekPopover: document.querySelector("#filter-week-popover"),
  filterWeekList: document.querySelector("#filter-week-list"),
  filterTour: document.querySelector("#filter-tour"),
  filterDriver: document.querySelector("#filter-driver"),
  clearFiltersButton: document.querySelector("#clear-filters-button"),
  newOrderButton: document.querySelector("#new-order-button"),
  bulkCount: document.querySelector("#bulk-count"),
  bulkSubline: document.querySelector("#bulk-subline"),
  bulkClearSelection: document.querySelector("#bulk-clear-selection"),
  bulkDriver: document.querySelector("#bulk-driver"),
  bulkTwoDayTour: document.querySelector("#bulk-two-day-tour"),
  bulkSave: document.querySelector("#bulk-save"),
  bulkNotify: document.querySelector("#bulk-notify"),
  bulkRevoke: document.querySelector("#bulk-revoke"),
  bulkHint: document.querySelector("#bulk-hint"),
  demoNotice: document.querySelector("#demo-notice"),
  sourceErrorNotice: document.querySelector("#source-error-notice"),
  drawer: document.querySelector("#order-drawer"),
  drawerClose: document.querySelector("#drawer-close"),
  manualOrderModal: document.querySelector("#manual-order-modal"),
  manualOrderClose: document.querySelector("#manual-order-close"),
  manualOrderCancel: document.querySelector("#manual-order-cancel"),
  confirmModal: document.querySelector("#confirm-modal"),
  confirmMessage: document.querySelector("#confirm-message"),
  confirmCancel: document.querySelector("#confirm-cancel"),
  confirmAccept: document.querySelector("#confirm-accept"),
  orderForm: document.querySelector("#order-form"),
  driverForm: document.querySelector("#driver-form"),
  driverId: document.querySelector("#driver-id"),
  driverLabel: document.querySelector("#driver-label"),
  driverPhone: document.querySelector("#driver-phone"),
  driverSubmit: document.querySelector("#driver-submit"),
  driverCancel: document.querySelector("#driver-cancel"),
  manualOrderForm: document.querySelector("#manual-order-form"),
  manualTour: document.querySelector("#manual-tour"),
  manualDriver: document.querySelector("#manual-driver"),
  csvImportForm: document.querySelector("#csv-import-form"),
  csvFile: document.querySelector("#csv-file"),
  sqlSection: document.querySelector("#sql-settings-section"),
  sqlSettingsForm: document.querySelector("#sql-settings-form"),
  sqlOrdersQuery: document.querySelector("#sql-orders-query"),
  sqlToursQuery: document.querySelector("#sql-tours-query"),
  mailSection: document.querySelector("#mail-settings-section"),
  mailSettingsForm: document.querySelector("#mail-settings-form"),
  mailSubject: document.querySelector("#mail-subject"),
  mailBody: document.querySelector("#mail-body"),
  mailTextmarks: document.querySelector("#mail-textmarks"),
  mailAdminOnly: document.querySelectorAll(".mail-admin-only"),
  mailSmtpHost: document.querySelector("#mail-smtp-host"),
  mailSmtpPort: document.querySelector("#mail-smtp-port"),
  mailSmtpSecure: document.querySelector("#mail-smtp-secure"),
  mailSmtpVerifyCertificate: document.querySelector("#mail-smtp-verify-certificate"),
  mailSmtpUser: document.querySelector("#mail-smtp-user"),
  mailSmtpPassword: document.querySelector("#mail-smtp-password"),
  mailFromName: document.querySelector("#mail-from-name"),
  mailFromEmail: document.querySelector("#mail-from-email"),
  mailReplyTo: document.querySelector("#mail-reply-to"),
  mailDemoMode: document.querySelector("#mail-demo-mode"),
  mailDemoRecipients: document.querySelector("#mail-demo-recipients"),
  mailDemoRecipientsRow: document.querySelector("#mail-demo-recipients-row"),
  ldapSection: document.querySelector("#ldap-settings-section"),
  ldapSettingsForm: document.querySelector("#ldap-settings-form"),
  ldapEnabled: document.querySelector("#ldap-enabled"),
  ldapName: document.querySelector("#ldap-name"),
  ldapHost: document.querySelector("#ldap-host"),
  ldapPort: document.querySelector("#ldap-port"),
  ldapVerifyCertificate: document.querySelector("#ldap-verify-certificate"),
  ldapCertificate: document.querySelector("#ldap-certificate"),
  ldapBindDn: document.querySelector("#ldap-bind-dn"),
  ldapBindPassword: document.querySelector("#ldap-bind-password"),
  ldapBaseDn: document.querySelector("#ldap-base-dn"),
  ldapUserFilter: document.querySelector("#ldap-user-filter"),
  ldapLoginAttribute: document.querySelector("#ldap-login-attribute"),
  ldapUserGroupDn: document.querySelector("#ldap-user-group-dn"),
  ldapAdminGroupDn: document.querySelector("#ldap-admin-group-dn"),
  ldapDepartmentLeadGroupDn: document.querySelector("#ldap-department-lead-group-dn"),
  userForm: document.querySelector("#user-form"),
  userId: document.querySelector("#user-id"),
  userUsername: document.querySelector("#user-username"),
  userDisplayName: document.querySelector("#user-display-name"),
  userPassword: document.querySelector("#user-password"),
  userRole: document.querySelector("#user-role"),
  userActive: document.querySelector("#user-active"),
  userSubmit: document.querySelector("#user-submit"),
  userCancel: document.querySelector("#user-cancel"),
  toast: document.querySelector("#toast"),
  stats: {
    total: document.querySelector("#stat-total"),
    open: document.querySelector("#stat-open"),
    notified: document.querySelector("#stat-notified")
  },
  drawerFields: {
    title: document.querySelector("#drawer-title"),
    customer: document.querySelector("#drawer-customer"),
    commission: document.querySelector("#drawer-commission"),
    address: document.querySelector("#drawer-address"),
    contact: document.querySelector("#drawer-contact"),
    tour: document.querySelector("#drawer-tour"),
    shippingEh: document.querySelector("#drawer-shipping-eh"),
    elementWeight: document.querySelector("#drawer-element-weight"),
    blrCount: document.querySelector("#drawer-blr-count"),
    eprodStorageLocation: document.querySelector("#drawer-eprod-storage-location"),
    deliveryDate: document.querySelector("#edit-delivery-date-display"),
    deliveryDateReadonly: document.querySelector("#edit-delivery-date-readonly"),
    deliveryDateEdit: document.querySelector("#edit-delivery-date-edit"),
    deliveryDateInput: document.querySelector("#edit-delivery-date-input"),
    deliveryAddressEdit: document.querySelector("#edit-delivery-address-edit"),
    deliveryAddressInput: document.querySelector("#edit-delivery-address-input"),
    twoDayTour: document.querySelector("#edit-two-day-tour"),
    driver: document.querySelector("#edit-driver"),
    note: document.querySelector("#edit-note"),
    customerInfo: document.querySelector("#edit-customer-info"),
    notified: document.querySelector("#edit-notified")
  },
  log: {
    updated: document.querySelector("#log-updated"),
    notified: document.querySelector("#log-notified"),
    list: document.querySelector("#log-list"),
    mailList: document.querySelector("#mail-log-list")
  },
  markNotified: document.querySelector("#mark-notified")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  state.token = localStorage.getItem("avisToken") || "";

  if (!state.token) {
    showLogin();
    return;
  }

  try {
    state.currentUser = await api("/api/auth/me");
    await enterApp();
  } catch (error) {
    showLogin("Bitte neu anmelden.");
  }
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", login);
  elements.logoutButton.addEventListener("click", logout);
  elements.tabs.orders.addEventListener("click", () => showView("orders"));
  elements.tabs.import.addEventListener("click", () => showView("import"));
  elements.tabs.masterdata.addEventListener("click", () => showView("masterdata"));
  elements.filterDate.addEventListener("change", () => {
    state.deliveryDate = elements.filterDate.value;
    state.deliveryWeek = "";
    renderWeekPicker();
    state.tour = "";
    loadOrders();
  });
  elements.filterWeekButton.addEventListener("click", () => toggleWeekPicker());
  elements.filterWeekList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-week]");

    if (!button) {
      return;
    }

    selectWeekFilter(button.dataset.week || "");
  });
  document.addEventListener("click", (event) => {
    if (!elements.filterWeekPopover.hidden && !event.target.closest(".week-control")) {
      closeWeekPicker();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeWeekPicker();
    }
  });
  elements.filterTour.addEventListener("change", () => {
    state.tour = elements.filterTour.value;
    loadOrders();
  });
  elements.filterDriver.addEventListener("change", () => {
    state.driverPhoneId = elements.filterDriver.value;
    loadOrders();
  });
  elements.clearFiltersButton.addEventListener("click", clearFilters);
  elements.newOrderButton.addEventListener("click", openManualOrderModal);
  elements.bulkSave.addEventListener("click", () => applyBulk(false));
  elements.bulkNotify.addEventListener("click", () => applyBulk(true));
  elements.bulkRevoke.addEventListener("click", revokeBulkAvis);
  elements.bulkClearSelection.addEventListener("click", clearBulkSelection);
  elements.bulkDriver.addEventListener("change", renderBulkState);
  elements.bulkTwoDayTour.addEventListener("change", renderBulkState);
  elements.masterdataTabs.forEach((button) => {
    button.addEventListener("click", () => showMasterdataPage(button.dataset.masterdataTab));
  });
  elements.drawerClose.addEventListener("click", closeDrawer);
  elements.manualOrderClose.addEventListener("click", closeManualOrderModal);
  elements.manualOrderCancel.addEventListener("click", closeManualOrderModal);
  elements.confirmCancel.addEventListener("click", () => closeConfirm(false));
  elements.confirmAccept.addEventListener("click", () => closeConfirm(true));
  elements.orderForm.addEventListener("submit", saveSelectedOrder);
  elements.driverForm.addEventListener("submit", saveDriverPhone);
  elements.driverCancel.addEventListener("click", resetDriverForm);
  elements.manualOrderForm.addEventListener("submit", createLocalOrder);
  elements.csvImportForm.addEventListener("submit", importCsvOrders);
  elements.mailSettingsForm.addEventListener("submit", saveMailSettings);
  elements.mailDemoMode.addEventListener("change", renderMailDemoState);
  elements.mailTextmarks.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mail-token]");

    if (!button) {
      return;
    }

    insertMailToken(button.dataset.mailToken);
  });
  elements.sqlSettingsForm.addEventListener("submit", saveSqlSettings);
  elements.ldapSettingsForm.addEventListener("submit", saveLdapSettings);
  elements.userForm.addEventListener("submit", saveUser);
  elements.userCancel.addEventListener("click", resetUserForm);
  elements.markNotified.addEventListener("click", () => {
    state.notifySelectedOrder = true;
    elements.drawerFields.notified.checked = true;
    elements.orderForm.requestSubmit();
  });

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      setStatusFilter(button.dataset.status);
      loadOrders();
    });
  });

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      setOrderSort(button.dataset.sort);
      renderOrders();
    });
  });

  elements.searchInput.addEventListener("input", debounce(() => {
    state.search = elements.searchInput.value;
    loadOrders();
  }, 250));

  elements.ordersBody.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-order]");

    if (deleteButton) {
      await deleteLocalOrder(deleteButton.dataset.deleteOrder);
      return;
    }

    const revokeButton = event.target.closest("[data-revoke-order]");

    if (revokeButton) {
      await revokeOrderAvis(revokeButton.dataset.revokeOrder);
      return;
    }

    const button = event.target.closest("[data-edit-order]");

    if (button) {
      openDrawer(button.dataset.editOrder);
      return;
    }

    const row = event.target.closest("[data-order-number]");

    if (!row) {
      return;
    }

    handleBulkRowSelection(event, row.dataset.orderNumber);
  });

  elements.driversBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-driver]");

    if (editButton) {
      editDriverPhone(editButton.dataset.editDriver);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-driver]");

    if (!deleteButton) {
      return;
    }

    await deleteDriverPhone(deleteButton.dataset.deleteDriver);
  });

  elements.usersBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-user]");

    if (editButton) {
      editUser(editButton.dataset.editUser);
      return;
    }

    const button = event.target.closest("[data-deactivate-user]");

    if (!button) {
      return;
    }

    await api(`/api/users/${encodeURIComponent(button.dataset.deactivateUser)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false })
    });
    await loadUsers();
    showToast("Benutzer deaktiviert.");
  });
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(elements.loginForm);

  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    state.token = result.token;
    state.currentUser = result.user;
    localStorage.setItem("avisToken", state.token);
    await enterApp();
  } catch (error) {
    showLogin(error.message);
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    // Logout should clear the local session even if the server token is already gone.
  }

  localStorage.removeItem("avisToken");
  state.token = "";
  state.currentUser = null;
  showLogin();
}

async function enterApp() {
  setStatusFilter("open");
  elements.loginView.hidden = true;
  elements.appShell.hidden = false;
  elements.currentUser.textContent = state.currentUser?.displayName || state.currentUser?.username || "-";
  elements.loginError.hidden = true;
  configureRoleUi();
  await loadDrivers();
  await loadTours();
  if (isAdmin()) {
    resetUserForm();
    await loadMailSettings();
    await loadUsers();
  }

  if (isFullAdmin()) {
    await loadSqlSettings();
    await loadLdapSettings();
  }
  await loadOrders();
}

function setStatusFilter(status) {
  state.status = status;
  document.querySelectorAll("[data-status]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.status === status);
  });
}

function setOrderSort(key) {
  if (state.sort.key === key) {
    state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
    return;
  }

  state.sort.key = key;
  state.sort.direction = "asc";
}

function clearFilters() {
  setStatusFilter("all");
  state.search = "";
  state.deliveryDate = "";
  state.deliveryWeek = "";
  state.tour = "";
  state.driverPhoneId = "";
  elements.searchInput.value = "";
  elements.filterDate.value = "";
  renderWeekPicker();
  elements.filterTour.value = "";
  elements.filterDriver.value = "";
  loadOrders();
}

function showLogin(message = "") {
  elements.appShell.hidden = true;
  elements.loginView.hidden = false;
  elements.loginError.textContent = message;
  elements.loginError.hidden = !message;
}

function showView(view) {
  if (view === "masterdata" && !isAdmin()) {
    view = "orders";
  }

  const isOrders = view === "orders";
  const isImport = view === "import";
  const isMasterdata = view === "masterdata";
  elements.views.orders.hidden = !isOrders;
  elements.views.import.hidden = !isImport;
  elements.views.masterdata.hidden = !isMasterdata;
  elements.tabs.orders.classList.toggle("is-active", isOrders);
  elements.tabs.import.classList.toggle("is-active", isImport);
  elements.tabs.masterdata.classList.toggle("is-active", isMasterdata);

  if (isMasterdata) {
    showMasterdataPage(state.masterdataPage);
  }
}

function configureRoleUi() {
  const admin = isAdmin();
  elements.tabs.masterdata.hidden = !admin;
  configureMasterdataTabs();
  elements.mailAdminOnly.forEach((item) => {
    item.hidden = !isFullAdmin();
  });
  renderMailDemoState();
  renderUserRoleOptions();

  if (!admin) {
    showView("orders");
  }
}

function configureMasterdataTabs() {
  elements.masterdataTabs.forEach((button) => {
    button.hidden = !canSeeMasterdataPage(button.dataset.masterdataTab);
  });

  if (!canSeeMasterdataPage(state.masterdataPage)) {
    state.masterdataPage = firstVisibleMasterdataPage();
  }

  elements.masterdataPanels.forEach((panel) => {
    const active = panel.dataset.masterdataPanel === state.masterdataPage;
    panel.hidden = !active || !canSeeMasterdataPage(panel.dataset.masterdataPanel);
  });

  elements.masterdataTabs.forEach((button) => {
    const active = button.dataset.masterdataTab === state.masterdataPage && !button.hidden;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function showMasterdataPage(page) {
  if (canSeeMasterdataPage(page)) {
    state.masterdataPage = page;
  } else {
    state.masterdataPage = firstVisibleMasterdataPage();
  }

  configureMasterdataTabs();
}

function firstVisibleMasterdataPage() {
  const first = [...elements.masterdataTabs].find((button) => canSeeMasterdataPage(button.dataset.masterdataTab));
  return first?.dataset.masterdataTab || "drivers";
}

function canSeeMasterdataPage(page) {
  if (!isAdmin()) {
    return false;
  }

  return ["auth", "sql"].includes(page) ? isFullAdmin() : ["drivers", "mail", "users"].includes(page);
}

function isAdmin() {
  return ["admin", "superuser"].includes(state.currentUser?.role);
}

function isFullAdmin() {
  return state.currentUser?.role === "admin";
}

async function loadOrders() {
  const params = new URLSearchParams({
    status: state.status,
    search: state.search,
    deliveryDate: state.deliveryDate,
    deliveryWeek: state.deliveryWeek,
    tour: state.tour,
    driverPhoneId: state.driverPhoneId
  });

  try {
    const data = await api(`/api/orders?${params.toString()}`);
    state.orders = data.orders;
    reconcileBulkSelection();
    const weekWasCleared = updateFilterWeeks(data.availableWeeks || []);
    const tourWasCleared = updateFilterTours(data.availableTours || []);

    if (weekWasCleared || tourWasCleared) {
      await loadOrders();
      return;
    }

    elements.demoNotice.hidden = !data.usingDemoData;
    hideSourceError();
    renderStats(data.summary);
    renderOrders();
    renderBulkState();
  } catch (error) {
    state.orders = [];
    reconcileBulkSelection();
    updateFilterWeeks([]);
    updateFilterTours([]);
    elements.demoNotice.hidden = true;
    showSourceError(error);
    renderStats({ total: 0, open: 0, notified: 0 });
    renderOrders(sourceErrorMessage(error));
    renderBulkState();
  }
}

async function loadDrivers() {
  state.drivers = await api("/api/driver-phones");
  renderDrivers();
  resetDriverForm();
  renderDriverFilterOptions();
  renderDriverOptions(elements.drawerFields.driver);
  renderDriverOptions(elements.bulkDriver);
  renderDriverOptions(elements.manualDriver);
}

async function loadTours() {
  try {
    state.tours = await api("/api/tours");
    state.filterTours = state.tours;
    renderTours();
  } catch (error) {
    state.tours = [];
    state.filterTours = [];
    renderTours();
    showSourceError(error);
  }
}

async function loadUsers() {
  state.users = await api("/api/users");
  renderUsers();
}

async function loadSqlSettings() {
  state.sqlSettings = await api("/api/sql-settings");
  elements.sqlOrdersQuery.value = state.sqlSettings.ordersQuery || "";
  elements.sqlToursQuery.value = state.sqlSettings.toursQuery || "";
}

async function loadLdapSettings() {
  state.ldapSettings = await api("/api/ldap-settings");
  elements.ldapEnabled.checked = Boolean(state.ldapSettings.enabled);
  elements.ldapName.value = state.ldapSettings.name || "";
  elements.ldapHost.value = state.ldapSettings.host || "";
  elements.ldapPort.value = state.ldapSettings.port || 636;
  elements.ldapVerifyCertificate.checked = state.ldapSettings.verifyCertificate !== false;
  elements.ldapCertificate.value = state.ldapSettings.certificate || "";
  elements.ldapBindDn.value = state.ldapSettings.bindDn || "";
  elements.ldapBindPassword.value = state.ldapSettings.bindPassword || "";
  elements.ldapBaseDn.value = state.ldapSettings.baseDn || "";
  elements.ldapUserFilter.value = state.ldapSettings.userFilter || "(objectClass=*)";
  elements.ldapLoginAttribute.value = state.ldapSettings.loginAttribute || "sAMAccountName";
  elements.ldapUserGroupDn.value = state.ldapSettings.userGroupDn || "";
  elements.ldapAdminGroupDn.value = state.ldapSettings.adminGroupDn || "";
  elements.ldapDepartmentLeadGroupDn.value = state.ldapSettings.departmentLeadGroupDn || "";
}

async function loadMailSettings() {
  state.mailSettings = await api("/api/mail-settings");
  elements.mailSubject.value = state.mailSettings.subject || "";
  elements.mailBody.value = state.mailSettings.body || "";
  renderMailTextmarks(state.mailSettings.textMarks || []);

  if (isFullAdmin()) {
    elements.mailSmtpHost.value = state.mailSettings.smtpHost || "";
    elements.mailSmtpPort.value = state.mailSettings.smtpPort || 587;
    elements.mailSmtpSecure.checked = Boolean(state.mailSettings.smtpSecure);
    elements.mailSmtpVerifyCertificate.value = state.mailSettings.smtpVerifyCertificate ? "yes" : "no";
    elements.mailSmtpUser.value = state.mailSettings.smtpUser || "";
    elements.mailSmtpPassword.value = state.mailSettings.smtpPassword || "";
    elements.mailFromName.value = state.mailSettings.fromName || "";
    elements.mailFromEmail.value = state.mailSettings.fromEmail || "";
    elements.mailReplyTo.value = state.mailSettings.replyTo || "";
    elements.mailDemoMode.checked = state.mailSettings.demoMode !== false;
    elements.mailDemoRecipients.value = state.mailSettings.demoRecipients || "";
  }

  renderMailDemoState();
}

function renderMailTextmarks(textMarks) {
  if (textMarks.length === 0) {
    elements.mailTextmarks.innerHTML = `<span class="sub-text">Keine Textmarken geladen.</span>`;
    return;
  }

  elements.mailTextmarks.innerHTML = textMarks.map((item) => `
    <button class="textmark-button" data-mail-token="${escapeHtml(item.token)}" type="button">
      <strong>${escapeHtml(item.token)}</strong>
      <span>${escapeHtml(item.description || "")}</span>
    </button>
  `).join("");
}

function renderMailDemoState() {
  if (!elements.mailDemoRecipientsRow) {
    return;
  }

  elements.mailDemoRecipientsRow.hidden = !isFullAdmin() || !elements.mailDemoMode.checked;
}

function insertMailToken(token) {
  if (!token) {
    return;
  }

  const target = elements.mailBody;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.value = `${target.value.slice(0, start)}${token}${target.value.slice(end)}`;
  target.focus();
  target.setSelectionRange(start + token.length, start + token.length);
}

function renderStats(summary) {
  elements.stats.total.textContent = summary.total;
  elements.stats.open.textContent = summary.open;
  elements.stats.notified.textContent = summary.notified;
}

function renderOrders(errorMessage = "") {
  const showNotifiedAtColumn = shouldShowNotifiedAtColumn();

  if (!showNotifiedAtColumn && state.sort.key === "notifiedAt") {
    state.sort = { key: "", direction: "asc" };
  }

  elements.notifiedAtHeader.hidden = !showNotifiedAtColumn;
  elements.ordersTable.classList.toggle("has-notified-at", showNotifiedAtColumn);
  updateSortHeaders();
  const columnCount = showNotifiedAtColumn ? 11 : 10;

  if (errorMessage) {
    elements.ordersBody.innerHTML = `<tr><td class="empty is-error" colspan="${columnCount}">${escapeHtml(errorMessage)}</td></tr>`;
    return;
  }

  if (state.orders.length === 0) {
    elements.ordersBody.innerHTML = `<tr><td class="empty" colspan="${columnCount}">Keine Aufträge gefunden.</td></tr>`;
    return;
  }

  elements.ordersBody.innerHTML = sortedOrders().map((order) => {
    const selected = state.bulkSelectedOrderNumbers.has(order.orderNumber);

    return `
      <tr class="${selected ? "is-selected" : ""}" data-order-number="${escapeHtml(order.orderNumber)}" aria-selected="${selected ? "true" : "false"}">
        <td>${statusBadge(order.avis.notified)}</td>
        ${showNotifiedAtColumn ? `<td>
          <span class="main-text">${formatDateTime(order.avis.notifiedAt)}</span>
          ${order.avis.notifiedBy ? `<span class="sub-text">${escapeHtml(order.avis.notifiedBy)}</span>` : ""}
        </td>` : ""}
        <td>${driverPhoneBadge(order.avis.driverPhoneId)}</td>
        <td><strong>${escapeHtml(order.orderNumber)}</strong></td>
        <td>
          <span class="main-text">${escapeHtml(order.customerName || "-")}</span>
          <span class="sub-text">${escapeHtml(order.customerNumber || "")}</span>
        </td>
        <td>${escapeHtml(order.commission || "-")}</td>
        <td>
          <span class="main-text">${formatDate(order.displayDeliveryDate)}</span>
          ${order.avis.twoDayTour ? `<span class="sub-text two-day-text">2-Tagestour</span>` : ""}
        </td>
        <td>${formatWeek(order.displayDeliveryWeek || isoWeekValue(order.displayDeliveryDate || order.deliveryDate))}</td>
        <td>${escapeHtml(order.displayTour || "-")}</td>
        <td>
          <span class="main-text">${escapeHtml(order.sourcePhone || "-")}</span>
          <span class="sub-text">${escapeHtml(order.sourceEmail || "")}</span>
        </td>
        <td>
          <div class="row-actions">
            <button class="secondary small" data-edit-order="${escapeHtml(order.orderNumber)}" type="button">Bearbeiten</button>
            ${order.avis.notified ? `<button class="secondary danger small" data-revoke-order="${escapeHtml(order.orderNumber)}" type="button">Avisierung zurücknehmen</button>` : ""}
            ${isAdmin() && order.canDelete ? `<button class="secondary danger small" data-delete-order="${escapeHtml(order.orderNumber)}" type="button">Löschen</button>` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function shouldShowNotifiedAtColumn() {
  return state.status !== "open";
}

function sortedOrders() {
  if (!state.sort.key) {
    return state.orders;
  }

  return state.orders
    .map((order, index) => ({ order, index }))
    .sort((left, right) => {
      const leftValue = orderSortValue(left.order, state.sort.key);
      const rightValue = orderSortValue(right.order, state.sort.key);
      const leftEmpty = isEmptySortValue(leftValue);
      const rightEmpty = isEmptySortValue(rightValue);

      if (leftEmpty && rightEmpty) {
        return left.index - right.index;
      }

      if (leftEmpty) {
        return 1;
      }

      if (rightEmpty) {
        return -1;
      }

      const result = compareSortValues(leftValue, rightValue);

      if (result === 0) {
        return left.index - right.index;
      }

      return state.sort.direction === "desc" ? -result : result;
    })
    .map((entry) => entry.order);
}

function orderSortValue(order, key) {
  const values = {
    status: order.avis.notified ? 1 : 0,
    notifiedAt: order.avis.notifiedAt || "",
    driver: order.avis.driverPhoneLabel || "",
    orderNumber: order.orderNumber,
    customer: `${order.customerName || ""} ${order.customerNumber || ""}`.trim(),
    commission: order.commission,
    deliveryDate: order.displayDeliveryDate || order.deliveryDate,
    deliveryWeek: order.displayDeliveryWeek || isoWeekValue(order.displayDeliveryDate || order.deliveryDate),
    tour: order.displayTour || order.tour,
    contact: `${order.sourcePhone || ""} ${order.sourceEmail || ""}`.trim()
  };

  return values[key] ?? "";
}

function compareSortValues(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), "de", {
    numeric: true,
    sensitivity: "base"
  });
}

function isEmptySortValue(value) {
  return value === "" || value === null || value === undefined;
}

function visibleOrderNumbers() {
  return sortedOrders().map((order) => order.orderNumber);
}

function selectedBulkOrderNumbers() {
  const visible = new Set(state.orders.map((order) => order.orderNumber));
  return [...state.bulkSelectedOrderNumbers].filter((orderNumber) => visible.has(orderNumber));
}

function bulkTargetOrders() {
  const selected = new Set(selectedBulkOrderNumbers());
  return selected.size > 0
    ? state.orders.filter((order) => selected.has(order.orderNumber))
    : state.orders;
}

function bulkTargetOrderNumbers() {
  return bulkTargetOrders().map((order) => order.orderNumber);
}

function bulkRevokeTargetOrderNumbers() {
  return bulkTargetOrders()
    .filter((order) => order.avis.notified)
    .map((order) => order.orderNumber);
}

function reconcileBulkSelection() {
  const visible = new Set(state.orders.map((order) => order.orderNumber));
  state.bulkSelectedOrderNumbers = new Set([...state.bulkSelectedOrderNumbers].filter((orderNumber) => visible.has(orderNumber)));

  if (state.bulkLastSelectedOrderNumber && !visible.has(state.bulkLastSelectedOrderNumber)) {
    state.bulkLastSelectedOrderNumber = "";
  }
}

function handleBulkRowSelection(event, orderNumber) {
  const visible = visibleOrderNumbers();

  if (!visible.includes(orderNumber)) {
    return;
  }

  if (event.shiftKey && state.bulkLastSelectedOrderNumber && visible.includes(state.bulkLastSelectedOrderNumber)) {
    const start = visible.indexOf(state.bulkLastSelectedOrderNumber);
    const end = visible.indexOf(orderNumber);
    const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1);

    if (!event.ctrlKey && !event.metaKey) {
      state.bulkSelectedOrderNumbers = new Set();
    }

    for (const item of range) {
      state.bulkSelectedOrderNumbers.add(item);
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (state.bulkSelectedOrderNumbers.has(orderNumber)) {
      state.bulkSelectedOrderNumbers.delete(orderNumber);
    } else {
      state.bulkSelectedOrderNumbers.add(orderNumber);
    }

    state.bulkLastSelectedOrderNumber = orderNumber;
  } else {
    state.bulkSelectedOrderNumbers = new Set([orderNumber]);
    state.bulkLastSelectedOrderNumber = orderNumber;
  }

  renderOrders();
  renderBulkState();
}

function clearBulkSelection() {
  state.bulkSelectedOrderNumbers.clear();
  state.bulkLastSelectedOrderNumber = "";
  renderOrders();
  renderBulkState();
}

function updateSortHeaders() {
  document.querySelectorAll("[data-sort]").forEach((button) => {
    const active = button.dataset.sort === state.sort.key;
    const direction = active ? state.sort.direction : "";
    const header = button.closest("th");

    button.classList.toggle("is-active", active);
    button.dataset.direction = direction;
    button.setAttribute("aria-label", sortButtonLabel(button, active, direction));

    if (header) {
      header.setAttribute("aria-sort", active && direction === "desc" ? "descending" : active ? "ascending" : "none");
    }
  });
}

function sortButtonLabel(button, active, direction) {
  const label = button.textContent.trim();

  if (!active) {
    return `${label} aufsteigend sortieren`;
  }

  return direction === "asc"
    ? `${label} absteigend sortieren`
    : `${label} aufsteigend sortieren`;
}

function renderTours() {
  elements.filterTour.innerHTML = [
    `<option value="">Alle Touren</option>`,
    ...state.filterTours.map((tour) => `
      <option value="${escapeHtml(tour)}" ${tour === state.tour ? "selected" : ""}>${escapeHtml(tour)}</option>
    `)
  ].join("");

  elements.manualTour.innerHTML = [
    `<option value="">Bitte auswählen</option>`,
    ...state.tours.map((tour) => `
      <option value="${escapeHtml(tour)}">${escapeHtml(tour)}</option>
    `)
  ].join("");
}

function renderWeekPicker() {
  elements.filterWeekButton.textContent = state.deliveryWeek ? formatWeek(state.deliveryWeek) : "Alle KW";
  elements.filterWeekButton.classList.toggle("is-active", Boolean(state.deliveryWeek));

  const weekButtons = [
    `<button class="week-option ${state.deliveryWeek ? "" : "is-active"}" data-week="" type="button">Alle KW</button>`,
    ...state.filterWeeks.map((week) => `
      <button class="week-option ${week === state.deliveryWeek ? "is-active" : ""}" data-week="${escapeHtml(week)}" type="button">
        <span>${escapeHtml(formatWeek(week))}</span>
        <small>${escapeHtml(week.slice(0, 4))}</small>
      </button>
    `)
  ];

  elements.filterWeekList.innerHTML = weekButtons.join("");
}

function toggleWeekPicker() {
  elements.filterWeekPopover.hidden = !elements.filterWeekPopover.hidden;
}

function closeWeekPicker() {
  elements.filterWeekPopover.hidden = true;
}

function selectWeekFilter(week) {
  state.deliveryWeek = week;
  state.deliveryDate = "";
  state.tour = "";
  elements.filterDate.value = "";
  closeWeekPicker();
  renderWeekPicker();
  loadOrders();
}

function updateFilterWeeks(weeks) {
  state.filterWeeks = weeks;

  if (state.deliveryWeek && !state.filterWeeks.includes(state.deliveryWeek)) {
    state.deliveryWeek = "";
    renderWeekPicker();
    return true;
  }

  renderWeekPicker();
  return false;
}

function updateFilterTours(tours) {
  state.filterTours = tours;

  if (state.tour && !state.filterTours.includes(state.tour)) {
    state.tour = "";
    renderTours();
    return true;
  }

  renderTours();
  return false;
}

function showSourceError(error) {
  elements.sourceErrorNotice.textContent = sourceErrorMessage(error);
  elements.sourceErrorNotice.hidden = false;
}

function hideSourceError() {
  elements.sourceErrorNotice.hidden = true;
  elements.sourceErrorNotice.textContent = "";
}

function sourceErrorMessage(error) {
  return `MS-SQL-Verbindung fehlgeschlagen: ${error.message}`;
}

function renderDrivers() {
  if (state.drivers.length === 0) {
    elements.driversBody.innerHTML = `<tr><td class="empty" colspan="4">Noch keine Fahrertelefone angelegt.</td></tr>`;
    return;
  }

  elements.driversBody.innerHTML = state.drivers.map((driver) => `
    <tr class="${driver.active ? "" : "is-muted"}">
      <td><strong>${escapeHtml(driver.label)}</strong></td>
      <td>${escapeHtml(driver.phone)}</td>
      <td>${driver.active ? "Ja" : "Nein"}</td>
      <td>
        <div class="row-actions">
          <button class="secondary small" data-edit-driver="${escapeHtml(driver.id)}" type="button">Bearbeiten</button>
          <button class="secondary danger small" data-delete-driver="${escapeHtml(driver.id)}" type="button">Löschen</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderUsers() {
  if (state.users.length === 0) {
    elements.usersBody.innerHTML = `<tr><td class="empty" colspan="5">Noch keine Benutzer angelegt.</td></tr>`;
    return;
  }

  elements.usersBody.innerHTML = state.users.map((user) => `
    <tr class="${user.active ? "" : "is-muted"}">
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${escapeHtml(user.displayName)}</td>
      <td>${escapeHtml(roleLabel(user.role))}</td>
      <td>${user.active ? "Ja" : "Nein"}</td>
      <td>
        ${canEditUser(user) ? `<button class="secondary small" data-edit-user="${escapeHtml(user.id)}" type="button">Bearbeiten</button>` : ""}
        ${canEditUser(user) && user.active ? `<button class="secondary small" data-deactivate-user="${escapeHtml(user.id)}" type="button">Deaktivieren</button>` : ""}
      </td>
    </tr>
  `).join("");
}

function canEditUser(user) {
  return isFullAdmin() || user.role !== "admin";
}

function roleLabel(role) {
  if (role === "superuser") {
    return "Abteilungsleiter";
  }

  return role === "admin" ? "Admin" : "User";
}

function renderDriverFilterOptions() {
  const specialValues = new Set(["", "__assigned", "__missing"]);

  if (state.driverPhoneId && !specialValues.has(state.driverPhoneId) && !state.drivers.some((driver) => driver.id === state.driverPhoneId)) {
    state.driverPhoneId = "";
  }

  elements.filterDriver.innerHTML = [
    `<option value="">Alle Fahrertelefone</option>`,
    `<option value="__assigned">Fahrertelefon hinterlegt</option>`,
    `<option value="__missing">Fahrertelefon fehlt</option>`,
    ...state.drivers.map((driver) => `
      <option value="${escapeHtml(driver.id)}">
        ${escapeHtml(driver.label)} - ${escapeHtml(driver.phone)}
      </option>
    `)
  ].join("");
  elements.filterDriver.value = state.driverPhoneId;
}

function renderDriverOptions(target, selectedId = "") {
  const activeDrivers = state.drivers.filter((driver) => driver.active || driver.id === selectedId);
  target.innerHTML = [
    `<option value="">Bitte auswählen</option>`,
    ...activeDrivers.map((driver) => `
      <option value="${escapeHtml(driver.id)}" ${driver.id === selectedId ? "selected" : ""}>
        ${escapeHtml(driver.label)} - ${escapeHtml(driver.phone)}
      </option>
    `)
  ].join("");
}

function renderBulkState() {
  const selectedCount = selectedBulkOrderNumbers().length;
  const targetOrderNumbers = bulkTargetOrderNumbers();
  const revokeTargetCount = bulkRevokeTargetOrderNumbers().length;
  const targetCount = targetOrderNumbers.length;
  const hasSelection = selectedCount > 0;
  const countLabel = targetCount === 1 ? "1 Auftrag" : `${targetCount} Aufträge`;
  const countVerb = hasSelection ? "markiert" : "gefiltert";
  const missing = [];
  const hasOrders = targetCount > 0;
  const hasDriver = Boolean(elements.bulkDriver.value);
  const marksTwoDayTour = elements.bulkTwoDayTour.checked;

  elements.bulkCount.textContent = countLabel;
  elements.bulkSubline.textContent = hasSelection ? "markiert" : "im aktuellen Filter";
  elements.bulkClearSelection.hidden = !hasSelection;

  if (!hasOrders) {
    missing.push(hasSelection ? "markierte Aufträge" : "Aufträge im Filter");
  }

  const saveReady = hasOrders && (hasDriver || marksTwoDayTour);
  const notifyReady = hasOrders && hasDriver;
  const revokeReady = isAdmin() && revokeTargetCount > 0;
  elements.bulkSave.disabled = !saveReady;
  elements.bulkNotify.disabled = !notifyReady;
  elements.bulkRevoke.hidden = !revokeReady;
  elements.bulkRevoke.disabled = !revokeReady;

  if (missing.length > 0) {
    elements.bulkHint.textContent = `Noch erforderlich: ${missing.join(", ")}.`;
    return;
  }

  if (!saveReady) {
    elements.bulkHint.textContent = "Für Nur speichern bitte Fahrertelefon auswählen oder 2-Tagestour markieren.";
    return;
  }

  if (!notifyReady) {
    elements.bulkHint.textContent = `${bulkScopeLabel(hasSelection)} Es wurden ${countLabel} ${countVerb}. Avisieren benötigt zusätzlich ein Fahrertelefon.`;
    return;
  }

  elements.bulkHint.textContent = `${bulkScopeLabel(hasSelection)} Es wurden ${countLabel} ${countVerb}.`;
}

function bulkScopeLabel(hasSelection) {
  return hasSelection
    ? "Wird nur für die markierten Aufträge angewandt."
    : "Wird für alle Aufträge im Filter angewandt.";
}

function openDrawer(orderNumber) {
  const order = state.orders.find((item) => item.orderNumber === orderNumber);

  if (!order) {
    return;
  }

  state.selectedOrder = order;
  elements.drawerFields.title.textContent = order.orderNumber;
  elements.drawerFields.customer.textContent = order.customerName || "-";
  elements.drawerFields.commission.textContent = order.commission || "-";
  elements.drawerFields.address.textContent = order.deliveryAddress || order.customerAddress || "-";
  elements.drawerFields.contact.textContent = [order.sourcePhone, order.sourceEmail].filter(Boolean).join(" / ") || "-";
  elements.drawerFields.tour.textContent = order.tour || "-";
  elements.drawerFields.shippingEh.textContent = order.shippingEh || "-";
  elements.drawerFields.elementWeight.textContent = formatElementWeight(order.elementWeight);
  elements.drawerFields.blrCount.textContent = order.blrCount || "-";
  elements.drawerFields.eprodStorageLocation.textContent = order.eprodStorageLocation || "-";
  const deliveryDate = order.displayDeliveryDate || order.deliveryDate || "";
  const canEditLocalFields = Boolean(order.canDelete);
  elements.drawerFields.deliveryDate.textContent = formatDate(deliveryDate);
  elements.drawerFields.deliveryDateInput.value = deliveryDate;
  elements.drawerFields.deliveryDateReadonly.hidden = canEditLocalFields;
  elements.drawerFields.deliveryDateEdit.hidden = !canEditLocalFields;
  elements.drawerFields.deliveryAddressInput.value = order.deliveryAddress || "";
  elements.drawerFields.deliveryAddressEdit.hidden = !canEditLocalFields;
  elements.drawerFields.twoDayTour.checked = Boolean(order.avis.twoDayTour);
  elements.drawerFields.note.value = order.avis.note || "";
  elements.drawerFields.customerInfo.value = order.avis.customerInfo || "";
  elements.drawerFields.notified.checked = order.avis.notified;
  elements.drawerFields.notified.disabled = !order.avis.notified;
  elements.markNotified.hidden = order.avis.notified;
  renderDriverOptions(elements.drawerFields.driver, order.avis.driverPhoneId);
  renderOrderLog(order);
  renderMailLog(order);
  elements.drawer.classList.add("is-open");
  elements.drawer.setAttribute("aria-hidden", "false");
}

function renderOrderLog(order) {
  elements.log.updated.textContent = formatAudit(order.avis.updatedAt, order.avis.updatedBy);
  elements.log.notified.textContent = formatAudit(order.avis.notifiedAt, order.avis.notifiedBy);

  const entries = [...(order.avis.log || [])].reverse();

  if (entries.length === 0) {
    elements.log.list.innerHTML = `<p class="empty-log">Noch kein Log vorhanden.</p>`;
    return;
  }

  elements.log.list.innerHTML = entries.map((entry) => `
    <div class="log-entry">
      <strong>${escapeHtml(logTypeLabel(entry.type))}</strong>
      <span>${escapeHtml(formatDateTime(entry.at))}</span>
      <span>${escapeHtml(entry.by || "-")}</span>
    </div>
  `).join("");
}

function renderMailLog(order) {
  const entries = [...(order.avis.mailLog || [])].reverse();

  if (entries.length === 0) {
    elements.log.mailList.innerHTML = `<p class="empty-log">Noch keine E-Mail zu diesem Auftrag versendet.</p>`;
    return;
  }

  elements.log.mailList.innerHTML = entries.map((entry) => `
    <details class="mail-log-entry">
      <summary>
        <span>
          <strong>${escapeHtml(formatDateTime(entry.sentAt))}</strong>
          <small>${escapeHtml(formatMailRecipients(entry.recipients))}</small>
        </span>
        ${entry.demoMode ? `<span class="badge is-demo-mail">Demo</span>` : `<span class="badge is-driver-ok">Versendet</span>`}
      </summary>
      <div class="mail-log-meta">
        <span>Von</span>
        <strong>${escapeHtml(entry.from || "-")}</strong>
        <span>An</span>
        <strong>${escapeHtml(formatMailRecipients(entry.recipients))}</strong>
        <span>Betreff</span>
        <strong>${escapeHtml(entry.subject || "-")}</strong>
        <span>Gesendet von</span>
        <strong>${escapeHtml(entry.by || "-")}</strong>
        ${entry.messageId ? `<span>Message-ID</span><strong>${escapeHtml(entry.messageId)}</strong>` : ""}
      </div>
      <pre class="mail-log-body">${escapeHtml(entry.body || "")}</pre>
    </details>
  `).join("");
}

function closeDrawer() {
  state.selectedOrder = null;
  state.notifySelectedOrder = false;
  elements.drawerFields.notified.disabled = false;
  elements.markNotified.hidden = false;
  elements.drawer.classList.remove("is-open");
  elements.drawer.setAttribute("aria-hidden", "true");
}

function openManualOrderModal() {
  elements.manualOrderModal.hidden = false;
  elements.manualOrderModal.classList.add("is-open");
  elements.manualOrderModal.setAttribute("aria-hidden", "false");
  elements.manualOrderForm.elements.orderNumber.focus();
}

function closeManualOrderModal() {
  elements.manualOrderModal.classList.remove("is-open");
  elements.manualOrderModal.setAttribute("aria-hidden", "true");
  elements.manualOrderModal.hidden = true;
  elements.manualOrderForm.reset();
}

async function saveSelectedOrder(event) {
  event.preventDefault();

  if (!state.selectedOrder) {
    return;
  }

  const notifyAction = state.notifySelectedOrder;
  const payload = {
    driverPhoneId: elements.drawerFields.driver.value,
    twoDayTour: elements.drawerFields.twoDayTour.checked,
    note: elements.drawerFields.note.value,
    customerInfo: elements.drawerFields.customerInfo.value,
    notified: elements.drawerFields.notified.checked
  };

  if (notifyAction) {
    payload.notifyAction = true;
  }

  if (state.selectedOrder.canDelete) {
    payload.deliveryDate = elements.drawerFields.deliveryDateInput.value;
    payload.deliveryAddress = elements.drawerFields.deliveryAddressInput.value;
  }

  try {
    const result = await api(`/api/orders/${encodeURIComponent(state.selectedOrder.orderNumber)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    closeDrawer();
    await loadOrders();
    showToast(`${notifyAction ? "Auftrag avisiert" : "Auftrag gespeichert"}.${mailToastSuffix(result.mail)}`);
  } finally {
    state.notifySelectedOrder = false;
  }
}

async function applyBulk(notified) {
  const hasDriver = Boolean(elements.bulkDriver.value);
  const marksTwoDayTour = elements.bulkTwoDayTour.checked;
  const targetOrderNumbers = bulkTargetOrderNumbers();
  const hasSelection = selectedBulkOrderNumbers().length > 0;

  if (targetOrderNumbers.length === 0) {
    showToast(hasSelection ? "Keine markierten Aufträge." : "Keine Aufträge im aktuellen Filter.");
    return;
  }

  if (notified && !hasDriver) {
    showToast("Bitte Fahrertelefon auswählen.");
    return;
  }

  if (!notified && !hasDriver && !marksTwoDayTour) {
    showToast("Bitte Fahrertelefon auswählen oder 2-Tagestour markieren.");
    return;
  }

  const driverLabel = selectedBulkDriverLabel();
  const action = notified ? "avisieren" : "speichern";
  const recordLabel = targetOrderNumbers.length === 1 ? "1 Datensatz" : `${targetOrderNumbers.length} Datensätze`;
  const isSingleRecord = targetOrderNumbers.length === 1;
  const sourceLabel = hasSelection ? "aus der Markierung" : "aus der aktuell sichtbaren Liste";
  const changes = [
    hasDriver ? `Fahrertelefon "${driverLabel}" zugewiesen` : "",
    marksTwoDayTour ? "als 2-Tagestour markiert" : "",
    notified ? "als avisiert markiert" : ""
  ].filter(Boolean).join(" und ");
  const confirmed = await requestConfirm(`${isSingleRecord ? "Soll" : "Sollen"} ${recordLabel} ${sourceLabel} wirklich ${changes} werden?`);

  if (!confirmed) {
    showToast(`${action[0].toUpperCase()}${action.slice(1)} abgebrochen.`);
    return;
  }

  const result = await api("/api/orders/bulk", {
    method: "PATCH",
    body: JSON.stringify({
      orderNumbers: targetOrderNumbers,
      driverPhoneId: elements.bulkDriver.value,
      notified,
      twoDayTour: marksTwoDayTour
    })
  });

  await loadOrders();
  showToast(notified ? `${result.updated} Aufträge avisiert.${mailToastSuffix(result.mail)}` : `${result.updated} Aufträge gespeichert.`);
}

async function revokeBulkAvis() {
  if (!isAdmin()) {
    showToast("Nur Admins und Abteilungsleiter dürfen Avisierungen per Massenbearbeitung zurücknehmen.");
    return;
  }

  const targetOrderNumbers = bulkRevokeTargetOrderNumbers();
  const hasSelection = selectedBulkOrderNumbers().length > 0;

  if (targetOrderNumbers.length === 0) {
    showToast(hasSelection ? "Keine avisierten Aufträge markiert." : "Keine avisierten Aufträge im aktuellen Filter.");
    return;
  }

  const recordLabel = targetOrderNumbers.length === 1 ? "1 Avisierung" : `${targetOrderNumbers.length} Avisierungen`;
  const sourceLabel = hasSelection ? "aus der Markierung" : "aus der aktuell sichtbaren Liste";
  const confirmed = await requestConfirm(`${targetOrderNumbers.length === 1 ? "Soll" : "Sollen"} ${recordLabel} ${sourceLabel} wirklich zurückgenommen werden?`);

  if (!confirmed) {
    showToast("Zurücknehmen abgebrochen.");
    return;
  }

  const result = await api("/api/orders/bulk", {
    method: "PATCH",
    body: JSON.stringify({
      orderNumbers: targetOrderNumbers,
      notified: false
    })
  });

  await loadOrders();
  showToast(`${result.updated} Avisierungen zurückgenommen.`);
}

function selectedBulkDriverLabel() {
  const selected = elements.bulkDriver.selectedOptions[0];
  return selected ? selected.textContent.trim() : "";
}

function mailToastSuffix(mail) {
  if (!mail) {
    return "";
  }

  if (Object.hasOwn(mail, "total")) {
    if (mail.total === 0) {
      return "";
    }

    if (mail.failed > 0) {
      return ` Mailfehler: ${mail.messages[0] || "Versand fehlgeschlagen."}${mailHintSuffix(mail.items)}`;
    }

    if (mail.sent > 0 && mail.skipped === 0) {
      return mail.sent === 1 ? " E-Mail versendet." : ` ${mail.sent} E-Mails versendet.`;
    }

    if (mail.sent > 0) {
      return ` ${mail.sent} E-Mails versendet, ${mail.skipped} ohne Mail.`;
    }

    return ` Keine Mail versendet: ${mail.messages[0] || "Mailversand wurde uebersprungen."}`;
  }

  if (mail.failed) {
    return ` Mailfehler: ${mail.message || "Versand fehlgeschlagen."}${mailHintSuffix([mail])}`;
  }

  if (mail.sent) {
    return mail.demoMode ? " E-Mail im Demobetrieb versendet." : " E-Mail versendet.";
  }

  if (mail.skipped) {
    return ` Keine Mail versendet: ${mail.message || "Mailversand wurde uebersprungen."}`;
  }

  return "";
}

function mailHintSuffix(items = []) {
  const hint = items.find((item) => item?.hint)?.hint;
  return hint ? ` Hinweis: ${hint}` : "";
}

function requestConfirm(message) {
  elements.confirmMessage.textContent = message;
  elements.confirmModal.hidden = false;
  elements.confirmModal.classList.add("is-open");
  elements.confirmModal.setAttribute("aria-hidden", "false");
  elements.confirmAccept.focus();

  return new Promise((resolve) => {
    state.confirmResolve = resolve;
  });
}

function closeConfirm(confirmed) {
  elements.confirmModal.classList.remove("is-open");
  elements.confirmModal.setAttribute("aria-hidden", "true");
  elements.confirmModal.hidden = true;

  if (state.confirmResolve) {
    state.confirmResolve(confirmed);
    state.confirmResolve = null;
  }
}

async function saveDriverPhone(event) {
  event.preventDefault();
  const form = new FormData(elements.driverForm);
  const driverId = String(form.get("id") || "").trim();
  const url = driverId ? `/api/driver-phones/${encodeURIComponent(driverId)}` : "/api/driver-phones";

  await api(url, {
    method: driverId ? "PATCH" : "POST",
    body: JSON.stringify({
      label: form.get("label"),
      phone: form.get("phone"),
      active: true
    })
  });

  await loadDrivers();
  showToast(driverId ? "Fahrertelefon geändert." : "Fahrertelefon gespeichert.");
}

function editDriverPhone(driverId) {
  const driver = state.drivers.find((item) => item.id === driverId);

  if (!driver) {
    return;
  }

  elements.driverId.value = driver.id;
  elements.driverLabel.value = driver.label;
  elements.driverPhone.value = driver.phone;
  elements.driverSubmit.textContent = "Fahrertelefon speichern";
  elements.driverCancel.hidden = false;
  elements.driverLabel.focus();
}

function resetDriverForm() {
  elements.driverForm.reset();
  elements.driverId.value = "";
  elements.driverSubmit.textContent = "Fahrertelefon anlegen";
  elements.driverCancel.hidden = true;
}

async function deleteDriverPhone(driverId) {
  const driver = state.drivers.find((item) => item.id === driverId);

  if (!driver) {
    return;
  }

  const confirmed = await requestConfirm(`Fahrertelefon "${driver.label} - ${driver.phone}" wirklich löschen? Die Zuordnung wird aus allen Aufträgen entfernt.`);

  if (!confirmed) {
    showToast("Löschen abgebrochen.");
    return;
  }

  const result = await api(`/api/driver-phones/${encodeURIComponent(driverId)}`, {
    method: "DELETE"
  });

  await loadDrivers();
  await loadOrders();
  showToast(`Fahrertelefon gelöscht. ${result.clearedOrders || 0} Aufträge bereinigt.`);
}

async function createLocalOrder(event) {
  event.preventDefault();
  const form = new FormData(elements.manualOrderForm);

  await api("/api/local-orders", {
    method: "POST",
    body: JSON.stringify(formToOrder(form))
  });

  closeManualOrderModal();
  await loadTours();
  await loadOrders();
  showToast("Auftrag angelegt.");
}

async function importCsvOrders(event) {
  event.preventDefault();
  const file = elements.csvFile.files[0];

  if (!file) {
    showToast("Bitte CSV-Datei auswählen.");
    return;
  }

  const rows = parseCsv(await file.text()).map(mapCsvOrder).filter((order) => order.orderNumber);

  if (rows.length === 0) {
    showToast("Keine Aufträge in der CSV gefunden.");
    return;
  }

  const result = await api("/api/local-orders/import", {
    method: "POST",
    body: JSON.stringify({ orders: rows })
  });

  elements.csvImportForm.reset();
  await loadTours();
  await loadOrders();
  showToast(`${result.created} Aufträge importiert, ${result.skipped} übersprungen.`);
}

async function deleteLocalOrder(orderNumber) {
  const confirmed = await requestConfirm(`Soll der selbst angelegte oder importierte Auftrag "${orderNumber}" wirklich gelöscht werden?`);

  if (!confirmed) {
    return;
  }

  await api(`/api/local-orders/${encodeURIComponent(orderNumber)}`, {
    method: "DELETE"
  });

  await loadTours();
  await loadOrders();
  showToast("Auftrag gelöscht.");
}

async function revokeOrderAvis(orderNumber) {
  const order = state.orders.find((item) => item.orderNumber === orderNumber);

  if (!order?.avis?.notified) {
    showToast("Dieser Auftrag ist nicht avisiert.");
    return;
  }

  const confirmed = await requestConfirm(`Soll die Avisierung für Auftrag "${orderNumber}" wirklich zurückgenommen werden?`);

  if (!confirmed) {
    return;
  }

  await api(`/api/orders/${encodeURIComponent(orderNumber)}`, {
    method: "PATCH",
    body: JSON.stringify({ notified: false })
  });

  await loadOrders();
  showToast("Avisierung zurückgenommen.");
}

async function saveSqlSettings(event) {
  event.preventDefault();

  if (!isFullAdmin()) {
    showToast("Nur Admins dürfen SQL-Abfragen speichern.");
    return;
  }

  await api("/api/sql-settings", {
    method: "PATCH",
    body: JSON.stringify({
      ordersQuery: elements.sqlOrdersQuery.value,
      toursQuery: elements.sqlToursQuery.value
    })
  });

  await loadSqlSettings();
  await loadTours();
  await loadOrders();
  showToast("SQL-Abfragen gespeichert.");
}

async function saveMailSettings(event) {
  event.preventDefault();

  if (!isAdmin()) {
    showToast("Nur Admins und Abteilungsleiter dürfen E-Mail Avis speichern.");
    return;
  }

  const body = {
    subject: elements.mailSubject.value,
    body: elements.mailBody.value
  };

  if (isFullAdmin()) {
    Object.assign(body, {
      smtpHost: elements.mailSmtpHost.value,
      smtpPort: elements.mailSmtpPort.value,
      smtpSecure: elements.mailSmtpSecure.checked,
      smtpVerifyCertificate: elements.mailSmtpVerifyCertificate.value === "yes",
      smtpUser: elements.mailSmtpUser.value,
      smtpPassword: elements.mailSmtpPassword.value,
      fromName: elements.mailFromName.value,
      fromEmail: elements.mailFromEmail.value,
      replyTo: elements.mailReplyTo.value,
      demoMode: elements.mailDemoMode.checked,
      demoRecipients: elements.mailDemoRecipients.value
    });
  }

  await api("/api/mail-settings", {
    method: "PATCH",
    body: JSON.stringify(body)
  });

  await loadMailSettings();
  showToast("E-Mail Avis gespeichert.");
}

async function saveLdapSettings(event) {
  event.preventDefault();

  if (!isFullAdmin()) {
    showToast("Nur Admins dürfen LDAPS-Einstellungen speichern.");
    return;
  }

  try {
    await api("/api/ldap-settings", {
      method: "PATCH",
      body: JSON.stringify({
        enabled: elements.ldapEnabled.checked,
        name: elements.ldapName.value,
        host: elements.ldapHost.value,
        port: elements.ldapPort.value,
        verifyCertificate: elements.ldapVerifyCertificate.checked,
        certificate: elements.ldapCertificate.value,
        bindDn: elements.ldapBindDn.value,
        bindPassword: elements.ldapBindPassword.value,
        baseDn: elements.ldapBaseDn.value,
        userFilter: elements.ldapUserFilter.value,
        loginAttribute: elements.ldapLoginAttribute.value,
        userGroupDn: elements.ldapUserGroupDn.value,
        adminGroupDn: elements.ldapAdminGroupDn.value,
        departmentLeadGroupDn: elements.ldapDepartmentLeadGroupDn.value
      })
    });

    await loadLdapSettings();
    showToast("LDAPS-Einstellungen gespeichert.");
  } catch (error) {
    showToast(`LDAPS konnte nicht gespeichert werden: ${error.message}`);
  }
}

async function saveUser(event) {
  event.preventDefault();
  const form = new FormData(elements.userForm);
  const userId = form.get("id");
  const body = {
    username: form.get("username"),
    displayName: form.get("displayName"),
    role: form.get("role"),
    active: form.get("active") === "on"
  };

  if (String(form.get("password") || "").trim()) {
    body.password = form.get("password");
  }

  if (userId) {
    await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    showToast("Benutzer gespeichert.");
  } else {
    body.password = form.get("password");
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify(body)
    });
    showToast("Benutzer angelegt.");
  }

  resetUserForm();
  await loadUsers();

  if (userId === state.currentUser?.id) {
    state.currentUser = await api("/api/auth/me");
    elements.currentUser.textContent = state.currentUser?.displayName || state.currentUser?.username || "-";
    configureRoleUi();
  }
}

function editUser(userId) {
  const user = state.users.find((item) => item.id === userId);

  if (!user) {
    return;
  }

  elements.userId.value = user.id;
  elements.userUsername.value = user.username;
  elements.userDisplayName.value = user.displayName;
  elements.userPassword.value = "";
  elements.userPassword.required = false;
  elements.userPassword.placeholder = "Leer lassen, wenn unverändert";
  renderUserRoleOptions(user.role || "user");
  elements.userRole.value = user.role || "user";
  elements.userActive.checked = user.active;
  elements.userSubmit.textContent = "Benutzer speichern";
  elements.userCancel.hidden = false;
}

function resetUserForm() {
  elements.userForm.reset();
  elements.userId.value = "";
  elements.userPassword.required = true;
  elements.userPassword.placeholder = "";
  renderUserRoleOptions("user");
  elements.userRole.value = "user";
  elements.userActive.checked = true;
  elements.userSubmit.textContent = "Benutzer anlegen";
  elements.userCancel.hidden = true;
}

function renderUserRoleOptions(selectedRole = elements.userRole?.value || "user") {
  if (!elements.userRole) {
    return;
  }

  const roles = [
    ["user", "User"],
    ["superuser", "Abteilungsleiter"],
    ...(isFullAdmin() ? [["admin", "Admin"]] : [])
  ];

  if (!isFullAdmin() && selectedRole === "admin") {
    selectedRole = "user";
  }

  elements.userRole.innerHTML = roles.map(([value, label]) => `
    <option value="${value}" ${value === selectedRole ? "selected" : ""}>${label}</option>
  `).join("");
}

function formToOrder(form) {
  return {
    orderNumber: form.get("orderNumber"),
    customerNumber: form.get("customerNumber"),
    customerName: form.get("customerName"),
    commission: form.get("commission"),
    deliveryDate: form.get("deliveryDate"),
    tour: form.get("tour"),
    driverPhoneId: form.get("driverPhoneId"),
    deliveryAddress: form.get("deliveryAddress"),
    sourcePhone: form.get("sourcePhone"),
    sourceEmail: form.get("sourceEmail")
  };
}

function mapCsvOrder(row) {
  return {
    orderNumber: readCsvValue(row, "abnummer", "auftrag", "auftragsnummer", "ordernumber"),
    customerNumber: readCsvValue(row, "kdnr", "kundennummer", "customernumber"),
    customerName: readCsvValue(row, "kunde", "kundenname", "customername"),
    customerAddress: readCsvValue(row, "kundeanschrift", "kundenanschrift", "customeraddress"),
    commission: readCsvValue(row, "kommission", "commission"),
    deliveryAddress: readCsvValue(row, "kapalieferanschrift", "lieferanschrift", "deliveryaddress"),
    deliveryDate: readCsvValue(row, "liefertermin", "lieferdatum", "deliverydate"),
    sourcePhone: readCsvValue(row, "kapatelefon", "telefon", "phone", "sourcephone"),
    sourceEmail: readCsvValue(row, "kapaemail", "email", "e-mail", "sourceemail"),
    tour: readCsvValue(row, "kapatour", "tour"),
    shippingEh: readCsvValue(row, "versandeh", "versand_eh", "shippingeh"),
    elementWeight: readCsvValue(row, "gewichtelemente", "gewicht_elemente", "elementweight"),
    blrCount: readCsvValue(row, "anzblr", "anz_blr", "blrcount"),
    eprodStorageLocation: readCsvValue(row, "eprodlagerplatz", "eprod_lagerplatz", "eprodstoragelocation")
  };
}

function readCsvValue(row, ...keys) {
  for (const key of keys) {
    const normalized = normalizeCsvKey(key);

    if (Object.hasOwn(row, normalized)) {
      return row[normalized];
    }
  }

  return "";
}

function parseCsv(content) {
  const delimiter = detectCsvDelimiter(content);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  rows.push(row);

  const [headerRow, ...dataRows] = rows.filter((item) => item.some(Boolean));

  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map(normalizeCsvKey);
  return dataRows.map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] || ""])));
}

function detectCsvDelimiter(content) {
  const firstLine = content.split(/\r?\n/, 1)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;

  return semicolons >= commas ? ";" : ",";
}

function normalizeCsvKey(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]/g, "");
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token && !options.skipAuth) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401 && !options.skipAuth) {
    localStorage.removeItem("avisToken");
    state.token = "";
    showLogin("Bitte neu anmelden.");
  }

  const text = await response.text();
  const data = parseJsonResponse(text);

  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }

  if (data === null) {
    throw new Error("Server hat keine gültige JSON-Antwort geliefert. Bitte Seite neu laden.");
  }

  return data;
}

function parseJsonResponse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function statusBadge(notified) {
  return notified
    ? `<span class="badge is-ok">Avisiert</span>`
    : `<span class="badge is-open">Nicht avisiert</span>`;
}

function driverPhoneBadge(driverPhoneId) {
  return driverPhoneId
    ? `<span class="badge is-driver-ok">Hinterlegt</span>`
    : `<span class="badge is-driver-missing">Fehlt</span>`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T00:00:00`));
}

function formatElementWeight(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "-";
  }

  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=.*[,])/g, "")
    .replace(",", ".");
  const number = Number(normalized);

  if (!Number.isFinite(number)) {
    return raw;
  }

  return `${Math.round(number).toLocaleString("de-DE")} Kg`;
}

function formatWeek(value) {
  const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);

  if (!match) {
    return "-";
  }

  return `KW${match[2]}`;
}

function isoWeekValue(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatAudit(at, by) {
  if (!at) {
    return "-";
  }

  return `${formatDateTime(at)} von ${by || "-"}`;
}

function logTypeLabel(type) {
  if (type === "avisiert") {
    return "Avisiert";
  }

  if (type === "fahrertelefon_geloescht") {
    return "Fahrertelefon gelöscht";
  }

  if (type === "avisierung_zurueckgenommen") {
    return "Avisierung zurückgenommen";
  }

  return "Gespeichert";
}

function formatMailRecipients(recipients) {
  const list = Array.isArray(recipients) ? recipients : [];
  return list.length > 0 ? list.join("; ") : "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(
    () => elements.toast.classList.remove("is-visible"),
    message.length > 90 ? 5200 : 2600
  );
}

function debounce(callback, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
