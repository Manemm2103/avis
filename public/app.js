const state = {
  token: "",
  currentUser: null,
  status: "open",
  search: "",
  deliveryDate: "",
  tour: "",
  orders: [],
  drivers: [],
  tours: [],
  filterTours: [],
  users: [],
  sqlSettings: null,
  sort: {
    key: "",
    direction: "asc"
  },
  selectedOrder: null,
  confirmResolve: null
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
    masterdata: document.querySelector("#tab-masterdata")
  },
  views: {
    orders: document.querySelector("#orders-view"),
    masterdata: document.querySelector("#masterdata-view")
  },
  ordersBody: document.querySelector("#orders-body"),
  driversBody: document.querySelector("#drivers-body"),
  usersBody: document.querySelector("#users-body"),
  searchInput: document.querySelector("#search-input"),
  filterDate: document.querySelector("#filter-date"),
  filterTour: document.querySelector("#filter-tour"),
  clearFiltersButton: document.querySelector("#clear-filters-button"),
  refreshButton: document.querySelector("#refresh-button"),
  newOrderButton: document.querySelector("#new-order-button"),
  bulkCount: document.querySelector("#bulk-count"),
  bulkDriver: document.querySelector("#bulk-driver"),
  bulkSave: document.querySelector("#bulk-save"),
  bulkNotify: document.querySelector("#bulk-notify"),
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
  manualOrderForm: document.querySelector("#manual-order-form"),
  manualTour: document.querySelector("#manual-tour"),
  manualDriver: document.querySelector("#manual-driver"),
  csvImportForm: document.querySelector("#csv-import-form"),
  csvFile: document.querySelector("#csv-file"),
  sqlSection: document.querySelector("#sql-settings-section"),
  sqlSettingsForm: document.querySelector("#sql-settings-form"),
  sqlOrdersQuery: document.querySelector("#sql-orders-query"),
  sqlToursQuery: document.querySelector("#sql-tours-query"),
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
    deliveryDate: document.querySelector("#edit-delivery-date"),
    driver: document.querySelector("#edit-driver"),
    note: document.querySelector("#edit-note"),
    customerInfo: document.querySelector("#edit-customer-info"),
    notified: document.querySelector("#edit-notified")
  },
  log: {
    updated: document.querySelector("#log-updated"),
    notified: document.querySelector("#log-notified"),
    list: document.querySelector("#log-list")
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
  elements.tabs.masterdata.addEventListener("click", () => showView("masterdata"));
  elements.refreshButton.addEventListener("click", loadOrders);
  elements.filterDate.addEventListener("change", () => {
    state.deliveryDate = elements.filterDate.value;
    state.tour = "";
    loadOrders();
  });
  elements.filterTour.addEventListener("change", () => {
    state.tour = elements.filterTour.value;
    loadOrders();
  });
  elements.clearFiltersButton.addEventListener("click", clearFilters);
  elements.newOrderButton.addEventListener("click", openManualOrderModal);
  elements.bulkSave.addEventListener("click", () => applyBulk(false));
  elements.bulkNotify.addEventListener("click", () => applyBulk(true));
  elements.bulkDriver.addEventListener("change", renderBulkState);
  elements.drawerClose.addEventListener("click", closeDrawer);
  elements.manualOrderClose.addEventListener("click", closeManualOrderModal);
  elements.manualOrderCancel.addEventListener("click", closeManualOrderModal);
  elements.confirmCancel.addEventListener("click", () => closeConfirm(false));
  elements.confirmAccept.addEventListener("click", () => closeConfirm(true));
  elements.orderForm.addEventListener("submit", saveSelectedOrder);
  elements.driverForm.addEventListener("submit", createDriverPhone);
  elements.manualOrderForm.addEventListener("submit", createLocalOrder);
  elements.csvImportForm.addEventListener("submit", importCsvOrders);
  elements.sqlSettingsForm.addEventListener("submit", saveSqlSettings);
  elements.userForm.addEventListener("submit", saveUser);
  elements.userCancel.addEventListener("click", resetUserForm);
  elements.markNotified.addEventListener("click", () => {
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

    const button = event.target.closest("[data-edit-order]");

    if (!button) {
      return;
    }

    openDrawer(button.dataset.editOrder);
  });

  elements.driversBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-archive-driver]");

    if (!button) {
      return;
    }

    await api(`/api/driver-phones/${encodeURIComponent(button.dataset.archiveDriver)}`, {
      method: "DELETE"
    });
    await loadDrivers();
    showToast("Fahrertelefon archiviert.");
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
    await loadUsers();
  }

  if (isSuperuser()) {
    await loadSqlSettings();
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
  state.tour = "";
  elements.searchInput.value = "";
  elements.filterDate.value = "";
  elements.filterTour.value = "";
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
  elements.views.orders.hidden = !isOrders;
  elements.views.masterdata.hidden = isOrders;
  elements.tabs.orders.classList.toggle("is-active", isOrders);
  elements.tabs.masterdata.classList.toggle("is-active", !isOrders);
}

function configureRoleUi() {
  const admin = isAdmin();
  elements.tabs.masterdata.hidden = !admin;
  elements.sqlSection.hidden = !isSuperuser();
  renderUserRoleOptions();

  if (!admin) {
    showView("orders");
  }
}

function isAdmin() {
  return ["admin", "superuser"].includes(state.currentUser?.role);
}

function isSuperuser() {
  return state.currentUser?.role === "superuser";
}

async function loadOrders() {
  const params = new URLSearchParams({
    status: state.status,
    search: state.search,
    deliveryDate: state.deliveryDate,
    tour: state.tour
  });

  try {
    const data = await api(`/api/orders?${params.toString()}`);
    state.orders = data.orders;
    const tourWasCleared = updateFilterTours(data.availableTours || []);

    if (tourWasCleared) {
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

function renderStats(summary) {
  elements.stats.total.textContent = summary.total;
  elements.stats.open.textContent = summary.open;
  elements.stats.notified.textContent = summary.notified;
}

function renderOrders(errorMessage = "") {
  updateSortHeaders();

  if (errorMessage) {
    elements.ordersBody.innerHTML = `<tr><td class="empty is-error" colspan="9">${escapeHtml(errorMessage)}</td></tr>`;
    return;
  }

  if (state.orders.length === 0) {
    elements.ordersBody.innerHTML = `<tr><td class="empty" colspan="9">Keine Aufträge gefunden.</td></tr>`;
    return;
  }

  elements.ordersBody.innerHTML = sortedOrders().map((order) => `
    <tr>
      <td>${statusBadge(order.avis.notified)}</td>
      <td>${driverPhoneBadge(order.avis.driverPhoneId)}</td>
      <td><strong>${escapeHtml(order.orderNumber)}</strong></td>
      <td>
        <span class="main-text">${escapeHtml(order.customerName || "-")}</span>
        <span class="sub-text">${escapeHtml(order.customerNumber || "")}</span>
      </td>
      <td>${escapeHtml(order.commission || "-")}</td>
      <td>${formatDate(order.displayDeliveryDate)}</td>
      <td>${escapeHtml(order.displayTour || "-")}</td>
      <td>
        <span class="main-text">${escapeHtml(order.sourcePhone || "-")}</span>
        <span class="sub-text">${escapeHtml(order.sourceEmail || "")}</span>
      </td>
      <td>
        <div class="row-actions">
          <button class="secondary small" data-edit-order="${escapeHtml(order.orderNumber)}" type="button">Bearbeiten</button>
          ${isAdmin() && order.canDelete ? `<button class="secondary danger small" data-delete-order="${escapeHtml(order.orderNumber)}" type="button">Löschen</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");
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
    driver: order.avis.driverPhoneLabel || "",
    orderNumber: order.orderNumber,
    customer: `${order.customerName || ""} ${order.customerNumber || ""}`.trim(),
    commission: order.commission,
    deliveryDate: order.displayDeliveryDate || order.deliveryDate,
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
        ${driver.active ? `<button class="secondary small" data-archive-driver="${escapeHtml(driver.id)}" type="button">Archivieren</button>` : ""}
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
  return isSuperuser() || user.role !== "superuser";
}

function roleLabel(role) {
  if (role === "superuser") {
    return "Superuser";
  }

  return role === "admin" ? "Admin" : "User";
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
  const countLabel = state.orders.length === 1 ? "1 Auftrag" : `${state.orders.length} Aufträge`;
  const missing = [];

  elements.bulkCount.textContent = countLabel;

  if (state.orders.length === 0) {
    missing.push("Aufträge im Filter");
  }

  if (state.drivers.filter((driver) => driver.active).length === 0) {
    missing.push("Fahrertelefon in Stammdaten");
  } else if (!elements.bulkDriver.value) {
    missing.push("Fahrertelefon");
  }

  const canBulk = missing.length === 0;
  elements.bulkSave.disabled = !canBulk;
  elements.bulkNotify.disabled = !canBulk;
  elements.bulkHint.textContent = canBulk
    ? `Wird für alle Aufträge im Filter angewandt. Es wurden ${countLabel} gefiltert.`
    : `Noch erforderlich: ${missing.join(", ")}.`;
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
  elements.drawerFields.deliveryDate.value = order.avis.deliveryDate || order.deliveryDate || "";
  elements.drawerFields.note.value = order.avis.note || "";
  elements.drawerFields.customerInfo.value = order.avis.customerInfo || "";
  elements.drawerFields.notified.checked = order.avis.notified;
  renderDriverOptions(elements.drawerFields.driver, order.avis.driverPhoneId);
  renderOrderLog(order);
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
      <strong>${escapeHtml(entry.type === "avisiert" ? "Avisiert" : "Gespeichert")}</strong>
      <span>${escapeHtml(formatDateTime(entry.at))}</span>
      <span>${escapeHtml(entry.by || "-")}</span>
    </div>
  `).join("");
}

function closeDrawer() {
  state.selectedOrder = null;
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

  await api(`/api/orders/${encodeURIComponent(state.selectedOrder.orderNumber)}`, {
    method: "PATCH",
    body: JSON.stringify({
      deliveryDate: elements.drawerFields.deliveryDate.value,
      driverPhoneId: elements.drawerFields.driver.value,
      note: elements.drawerFields.note.value,
      customerInfo: elements.drawerFields.customerInfo.value,
      notified: elements.drawerFields.notified.checked
    })
  });

  closeDrawer();
  await loadOrders();
  showToast("Auftrag gespeichert.");
}

async function applyBulk(notified) {
  if (state.orders.length === 0) {
    showToast("Keine Aufträge im aktuellen Filter.");
    return;
  }

  if (!elements.bulkDriver.value) {
    showToast("Bitte Fahrertelefon auswählen.");
    return;
  }

  const driverLabel = selectedBulkDriverLabel();
  const action = notified ? "avisieren" : "speichern";
  const recordLabel = state.orders.length === 1 ? "1 Datensatz" : `${state.orders.length} Datensätze`;
  const isSingleRecord = state.orders.length === 1;
  const confirmed = await requestConfirm(notified
    ? `${isSingleRecord ? "Soll" : "Sollen"} ${recordLabel} aus der aktuell sichtbaren Liste wirklich das Fahrertelefon "${driverLabel}" zugewiesen bekommen und als avisiert markiert werden?`
    : `${isSingleRecord ? "Soll" : "Sollen"} ${recordLabel} aus der aktuell sichtbaren Liste wirklich das Fahrertelefon "${driverLabel}" zugewiesen bekommen?`);

  if (!confirmed) {
    showToast(`${action[0].toUpperCase()}${action.slice(1)} abgebrochen.`);
    return;
  }

  const result = await api("/api/orders/bulk", {
    method: "PATCH",
    body: JSON.stringify({
      orderNumbers: state.orders.map((order) => order.orderNumber),
      driverPhoneId: elements.bulkDriver.value,
      notified
    })
  });

  await loadOrders();
  showToast(notified ? `${result.updated} Aufträge avisiert.` : `${result.updated} Aufträge gespeichert.`);
}

function selectedBulkDriverLabel() {
  const selected = elements.bulkDriver.selectedOptions[0];
  return selected ? selected.textContent.trim() : "";
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

async function createDriverPhone(event) {
  event.preventDefault();
  const form = new FormData(elements.driverForm);

  await api("/api/driver-phones", {
    method: "POST",
    body: JSON.stringify({
      label: form.get("label"),
      phone: form.get("phone"),
      active: true
    })
  });

  elements.driverForm.reset();
  await loadDrivers();
  showToast("Fahrertelefon gespeichert.");
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

async function saveSqlSettings(event) {
  event.preventDefault();

  if (!isSuperuser()) {
    showToast("Nur Superuser dürfen SQL-Abfragen speichern.");
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
    ["admin", "Admin"],
    ...(isSuperuser() ? [["superuser", "Superuser"]] : [])
  ];

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
    tour: readCsvValue(row, "kapatour", "tour")
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
  setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function debounce(callback, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
