(() => {
  const BASE_SKILLS = ["Python", "Design", "Marketing", "Photography", "Public Speaking", "Excel", "Figma", "Video Editing"];
  const SKILL_POOL_KEY = "skillswap_dynamic_skills";
  const LEVELS = ["Beginner", "Intermediate", "Advanced"];
  const AVAILABILITY = ["Weekdays", "Weeknights", "Weekends", "Flexible"];

  const PAGE = location.pathname.split("/").pop() || "index.html";
  const PROTECTED_PAGES = new Set(["dashboard.html", "profile.html", "my-requests.html", "chat.html"]);

  const supabaseClient = createSupabaseClient();
  const db = createDataStore(supabaseClient);
  let chatRefreshHandle = null;

  const icons = {
    dashboard: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12h8V3H3z"></path><path d="M13 21h8v-6h-8z"></path><path d="M13 10h8V3h-8z"></path><path d="M3 21h8v-7H3z"></path></svg>',
    requests: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h14"></path><path d="M4 12h10"></path><path d="M4 17h7"></path><path d="M19 8l2 2-2 2"></path><path d="M16 12h5"></path></svg>',
    profile: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 20c1.7-3.3 4.4-5 8-5s6.3 1.7 8 5"></path></svg>',
    login: '<svg class="icon" viewBox="0 0 24 24"><path d="M14 4h6v16h-6"></path><path d="M10 12h10"></path><path d="M10 12l3-3"></path><path d="M10 12l3 3"></path><path d="M4 4h6"></path><path d="M4 20h6"></path></svg>',
    signup: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="M5 12h14"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    logout: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 4H4v16h5"></path><path d="M15 12H4"></path><path d="M15 12l-3-3"></path><path d="M15 12l-3 3"></path><path d="M20 4h-5"></path><path d="M20 20h-5"></path></svg>',
    chat: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 3z"></path><path d="M8 9h8"></path><path d="M8 12h5"></path></svg>'
  };

  document.addEventListener("DOMContentLoaded", async () => {
    await hydrateSkillPool();
    populateSelectOptions();
    await initializeApp();
  });

  async function initializeApp() {
    const user = await db.getCurrentUser();
    renderNav(user);

    if (PROTECTED_PAGES.has(PAGE) && !user) {
      location.href = "login.html";
      return;
    }

    if (PAGE === "index.html") {
      setupIndex(user);
      return;
    }

    if (PAGE === "signup.html") {
      setupSignup();
      return;
    }

    if (PAGE === "login.html") {
      setupLogin();
      return;
    }

    if (PAGE === "dashboard.html" && user) {
      await setupDashboard(user);
      return;
    }

    if (PAGE === "profile.html" && user) {
      await setupProfile(user);
      return;
    }

    if (PAGE === "my-requests.html" && user) {
      await setupRequests(user);
      return;
    }

    if (PAGE === "chat.html" && user) {
      await setupChat(user);
    }
  }

  function createSupabaseClient() {
    const cfg = window.SKILLSWAP_SUPABASE;
    if (!window.supabase || !cfg || !cfg.url || !cfg.anonKey) {
      return null;
    }
    try {
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (error) {
      console.error("Supabase client init failed", error);
      return null;
    }
  }

  function createDataStore(sb) {
    const isSupabase = Boolean(sb);

    if (!isSupabase) {
      return createLocalStore();
    }

    const userFromAuth = async () => {
      const { data, error } = await sb.auth.getUser();
      if (error || !data?.user) return null;
      return data.user;
    };

    const profileByUserId = async (userId) => {
      const { data } = await sb
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      return data || null;
    };

    return {
      mode: "supabase",
      async signUp(payload) {
        const { email, password, name, teach, learn, level, availability, bio } = payload;
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) return { error: error.message };

        if (data?.user?.id) {
          const upsertPayload = {
            user_id: data.user.id,
            email,
            name,
            teach,
            learn,
            level,
            availability,
            bio
          };
          const { error: profileError } = await sb.from("profiles").upsert(upsertPayload, { onConflict: "user_id" });
          if (profileError) return { error: profileError.message };
        }

        return { user: await this.getCurrentUser() };
      },

      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        return { user: await this.getCurrentUser() };
      },

      async signOut() {
        await sb.auth.signOut();
      },

      async getCurrentUser() {
        const authUser = await userFromAuth();
        if (!authUser) return null;
        const profile = await profileByUserId(authUser.id);
        if (!profile) {
          return {
            id: authUser.id,
            email: authUser.email,
            name: authUser.email,
            teach: "",
            learn: "",
            level: "Beginner",
            availability: "Flexible",
            bio: ""
          };
        }
        return normalizeProfile(profile);
      },

      async updateProfile(currentUser, patch) {
        const payload = {
          user_id: currentUser.id,
          email: currentUser.email,
          name: patch.name,
          teach: patch.teach,
          learn: patch.learn,
          level: patch.level,
          availability: patch.availability,
          bio: patch.bio
        };
        const { error } = await sb.from("profiles").upsert(payload, { onConflict: "user_id" });
        if (error) return { error: error.message };
        return { user: normalizeProfile(payload) };
      },

      async getProfileById(id) {
        const { data } = await sb.from("profiles").select("*").eq("user_id", id).single();
        return data ? normalizeProfile(data) : null;
      },

      async listMatches(currentUser) {
        const { data, error } = await sb.from("profiles").select("*").neq("user_id", currentUser.id);
        if (error || !data) return [];
        return data
          .map(normalizeProfile)
          .filter((candidate) => isReciprocalMatch(currentUser, candidate))
          .map((candidate) => ({ ...candidate, compatibility: computeCompatibility(currentUser, candidate) }))
          .sort((a, b) => b.compatibility - a.compatibility);
      },

      async createRequest(currentUser, targetId) {
        const { data: outgoingPending } = await sb
          .from("swap_requests")
          .select("id")
          .eq("requester_id", currentUser.id)
          .eq("target_id", targetId)
          .eq("status", "pending")
          .maybeSingle();
        if (outgoingPending?.id) return { error: "Request already sent." };

        const { data: pairHistory, error: pairError } = await sb
          .from("swap_requests")
          .select("status, requester_id, target_id")
          .or(`and(requester_id.eq.${currentUser.id},target_id.eq.${targetId}),and(requester_id.eq.${targetId},target_id.eq.${currentUser.id})`)
          .order("created_at", { ascending: false });
        if (pairError) return { error: pairError.message };

        const acceptedExists = (pairHistory || []).some((row) => row.status === "accepted");
        if (acceptedExists) return { error: "Swap already accepted with this match." };

        const incomingPendingExists = (pairHistory || []).some(
          (row) => row.status === "pending" && row.requester_id === targetId && row.target_id === currentUser.id
        );
        if (incomingPendingExists) {
          return { error: "This user already sent you a request. Accept, decline, or remove it first." };
        }

        const { error } = await sb.from("swap_requests").insert({
          requester_id: currentUser.id,
          target_id: targetId,
          status: "pending"
        });
        if (error) return { error: error.message };
        return { ok: true };
      },

      async listRequests(currentUser) {
        const { data, error } = await sb
          .from("swap_requests")
          .select("*")
          .or(`requester_id.eq.${currentUser.id},target_id.eq.${currentUser.id}`)
          .order("created_at", { ascending: false });
        if (error || !data) return [];

        const ids = new Set();
        data.forEach((row) => {
          ids.add(row.requester_id);
          ids.add(row.target_id);
        });

        const { data: profiles } = await sb.from("profiles").select("*").in("user_id", [...ids]);
        const profileMap = new Map((profiles || []).map((p) => [p.user_id, normalizeProfile(p)]));

        return data.map((row) => ({
          id: row.id,
          status: row.status,
          createdAt: row.created_at,
          requesterId: row.requester_id,
          targetId: row.target_id,
          requester: profileMap.get(row.requester_id),
          target: profileMap.get(row.target_id),
          direction: row.requester_id === currentUser.id ? "outgoing" : "incoming"
        }));
      },

      async setRequestStatus(currentUser, requestId, status) {
        const { error } = await sb
          .from("swap_requests")
          .update({ status })
          .eq("id", requestId)
          .eq("target_id", currentUser.id);
        if (error) return { error: error.message };
        return { ok: true };
      },

      async cancelRequest(currentUser, requestId) {
        const { error } = await sb
          .from("swap_requests")
          .delete()
          .eq("id", requestId)
          .or(`requester_id.eq.${currentUser.id},target_id.eq.${currentUser.id}`);
        if (error) return { error: error.message };
        return { ok: true };
      },

      async listChatPartners(currentUser) {
        const { data, error } = await sb
          .from("messages")
          .select("sender_id, receiver_id")
          .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
        if (error || !data) return [];

        const ids = new Set();
        data.forEach((row) => {
          ids.add(row.sender_id === currentUser.id ? row.receiver_id : row.sender_id);
        });
        if (ids.size === 0) return [];

        const { data: profiles } = await sb.from("profiles").select("*").in("user_id", [...ids]);
        return (profiles || []).map(normalizeProfile);
      },

      async getMessages(currentUser, peerId) {
        const roomKey = buildRoomKey(currentUser.id, peerId);
        const { data, error } = await sb
          .from("messages")
          .select("*")
          .eq("room_key", roomKey)
          .order("created_at", { ascending: true });
        if (error || !data) return [];
        return data.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          receiverId: m.receiver_id,
          content: m.content,
          createdAt: m.created_at
        }));
      },

      async sendMessage(currentUser, peerId, content) {
        const roomKey = buildRoomKey(currentUser.id, peerId);
        const { error } = await sb.from("messages").insert({
          room_key: roomKey,
          sender_id: currentUser.id,
          receiver_id: peerId,
          content
        });
        if (error) return { error: error.message };
        return { ok: true };
      },

      async listGlobalSkills() {
        const { data, error } = await sb
          .from("skill_catalog")
          .select("skill")
          .order("skill", { ascending: true });
        if (error || !data) return [];
        return data.map((row) => normalizeSkillLabel(row.skill)).filter(Boolean);
      },

      async saveGlobalSkills(skills) {
        const cleaned = skills.map(normalizeSkillLabel).filter(Boolean);
        if (cleaned.length === 0) return { ok: true };

        const payload = cleaned.map((skill) => ({ skill }));
        const { error } = await sb
          .from("skill_catalog")
          .upsert(payload, { onConflict: "skill", ignoreDuplicates: true });
        if (error) return { error: error.message };
        return { ok: true };
      }
    };
  }

  function createLocalStore() {
    const keyUsers = "skillswap_local_users";
    const keySession = "skillswap_local_session";
    const keyRequests = "skillswap_local_requests";
    const keyMessages = "skillswap_local_messages";

    const load = (key) => JSON.parse(localStorage.getItem(key) || "[]");
    const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

    return {
      mode: "local",
      async signUp(payload) {
        const users = load(keyUsers);
        if (users.some((u) => u.email.toLowerCase() === payload.email.toLowerCase())) {
          return { error: "Account already exists. Please log in." };
        }
        const user = {
          id: makeId(),
          email: payload.email,
          password: payload.password,
          name: payload.name,
          teach: payload.teach,
          learn: payload.learn,
          level: payload.level,
          availability: payload.availability,
          bio: payload.bio
        };
        users.push(user);
        save(keyUsers, users);
        localStorage.setItem(keySession, user.id);
        return { user: withoutPassword(user) };
      },

      async signIn(email, password) {
        const users = load(keyUsers);
        const user = users.find((entry) => entry.email.toLowerCase() === email.toLowerCase() && entry.password === password);
        if (!user) return { error: "Invalid email or password." };
        localStorage.setItem(keySession, user.id);
        return { user: withoutPassword(user) };
      },

      async signOut() {
        localStorage.removeItem(keySession);
      },

      async getCurrentUser() {
        const userId = localStorage.getItem(keySession);
        if (!userId) return null;
        const users = load(keyUsers);
        const user = users.find((entry) => entry.id === userId);
        return user ? withoutPassword(user) : null;
      },

      async updateProfile(currentUser, patch) {
        const users = load(keyUsers);
        const index = users.findIndex((entry) => entry.id === currentUser.id);
        if (index === -1) return { error: "User not found." };
        users[index] = {
          ...users[index],
          ...patch
        };
        save(keyUsers, users);
        return { user: withoutPassword(users[index]) };
      },

      async getProfileById(id) {
        const users = load(keyUsers);
        const user = users.find((entry) => entry.id === id);
        return user ? withoutPassword(user) : null;
      },

      async listMatches(currentUser) {
        const users = load(keyUsers)
          .map(withoutPassword)
          .filter((entry) => entry.id !== currentUser.id)
          .filter((entry) => isReciprocalMatch(currentUser, entry))
          .map((entry) => ({ ...entry, compatibility: computeCompatibility(currentUser, entry) }));
        return users.sort((a, b) => b.compatibility - a.compatibility);
      },

      async createRequest(currentUser, targetId) {
        const requests = load(keyRequests);
        const exists = requests.some((r) => r.requesterId === currentUser.id && r.targetId === targetId && r.status === "pending");
        if (exists) return { error: "Request already sent." };

        const acceptedExists = requests.some(
          (r) =>
            ((r.requesterId === currentUser.id && r.targetId === targetId) ||
              (r.requesterId === targetId && r.targetId === currentUser.id)) &&
            r.status === "accepted"
        );
        if (acceptedExists) return { error: "Swap already accepted with this match." };

        const incomingPendingExists = requests.some(
          (r) => r.requesterId === targetId && r.targetId === currentUser.id && r.status === "pending"
        );
        if (incomingPendingExists) {
          return { error: "This user already sent you a request. Accept, decline, or remove it first." };
        }

        requests.unshift({
          id: makeId(),
          requesterId: currentUser.id,
          targetId,
          status: "pending",
          createdAt: new Date().toISOString()
        });
        save(keyRequests, requests);
        return { ok: true };
      },

      async listRequests(currentUser) {
        const users = load(keyUsers).map(withoutPassword);
        const profileMap = new Map(users.map((u) => [u.id, u]));
        const requests = load(keyRequests)
          .filter((row) => row.requesterId === currentUser.id || row.targetId === currentUser.id)
          .map((row) => ({
            ...row,
            requester: profileMap.get(row.requesterId),
            target: profileMap.get(row.targetId),
            direction: row.requesterId === currentUser.id ? "outgoing" : "incoming"
          }))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return requests;
      },

      async setRequestStatus(currentUser, requestId, status) {
        const requests = load(keyRequests);
        const index = requests.findIndex((row) => row.id === requestId && row.targetId === currentUser.id);
        if (index === -1) return { error: "Request not found." };
        requests[index].status = status;
        save(keyRequests, requests);
        return { ok: true };
      },

      async cancelRequest(currentUser, requestId) {
        const requests = load(keyRequests);
        const filtered = requests.filter((row) => {
          const isOwner = row.requesterId === currentUser.id || row.targetId === currentUser.id;
          return !(isOwner && row.id === requestId);
        });
        save(keyRequests, filtered);
        return { ok: true };
      },

      async listChatPartners(currentUser) {
        const messages = load(keyMessages);
        const partnerIds = new Set();
        messages.forEach((message) => {
          if (message.senderId === currentUser.id) partnerIds.add(message.receiverId);
          if (message.receiverId === currentUser.id) partnerIds.add(message.senderId);
        });
        const users = load(keyUsers).map(withoutPassword);
        return users.filter((user) => partnerIds.has(user.id));
      },

      async getMessages(currentUser, peerId) {
        const roomKey = buildRoomKey(currentUser.id, peerId);
        return load(keyMessages)
          .filter((m) => m.roomKey === roomKey)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      },

      async sendMessage(currentUser, peerId, content) {
        const messages = load(keyMessages);
        messages.push({
          id: makeId(),
          roomKey: buildRoomKey(currentUser.id, peerId),
          senderId: currentUser.id,
          receiverId: peerId,
          content,
          createdAt: new Date().toISOString()
        });
        save(keyMessages, messages);
        return { ok: true };
      },

      async listGlobalSkills() {
        return JSON.parse(localStorage.getItem(SKILL_POOL_KEY) || "[]")
          .map(normalizeSkillLabel)
          .filter(Boolean);
      },

      async saveGlobalSkills(skills) {
        const cleaned = skills.map(normalizeSkillLabel).filter(Boolean);
        if (cleaned.length === 0) return { ok: true };
        const existing = JSON.parse(localStorage.getItem(SKILL_POOL_KEY) || "[]")
          .map(normalizeSkillLabel)
          .filter(Boolean);
        const merged = [...new Set([...existing, ...cleaned])].sort((a, b) => a.localeCompare(b));
        localStorage.setItem(SKILL_POOL_KEY, JSON.stringify(merged));
        return { ok: true };
      }
    };
  }

  async function hydrateSkillPool() {
    const remoteSkills = db.listGlobalSkills ? await db.listGlobalSkills() : [];
    const merged = [...new Set([...getLocalSkills(), ...remoteSkills].map(normalizeSkillLabel).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    localStorage.setItem(SKILL_POOL_KEY, JSON.stringify(merged));
  }

  function normalizeProfile(raw) {
    return {
      id: raw.user_id,
      email: raw.email,
      name: raw.name,
      teach: raw.teach,
      learn: raw.learn,
      level: raw.level || "Beginner",
      availability: raw.availability || "Flexible",
      bio: raw.bio || ""
    };
  }

  function withoutPassword(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  function computeCompatibility(user, candidate) {
    let score = 60;
    if (user.learn === candidate.teach) score += 20;
    if (user.teach === candidate.learn) score += 15;
    if (user.level === candidate.level) score += 5;
    return Math.min(100, score);
  }

  function isReciprocalMatch(user, candidate) {
    return user.learn === candidate.teach && user.teach === candidate.learn;
  }

  function buildRoomKey(a, b) {
    return [a, b].sort().join("__");
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function populateSelectOptions() {
    const skillPool = getSkillPool();
    const skillSelects = ["teach", "learn", "update-teach", "update-learn"];
    skillSelects.forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;
      const previous = select.value;
      const placeholderText = select.options[0]?.textContent || "Choose one...";
      select.innerHTML = `<option value="">${placeholderText}</option>`;
      skillPool.forEach((skill) => {
        const option = document.createElement("option");
        option.value = skill;
        option.textContent = skill;
        select.appendChild(option);
      });
      if (previous) select.value = previous;
    });

    fillOptionList("level", LEVELS);
    fillOptionList("update-level", LEVELS);
    fillOptionList("availability", AVAILABILITY);
    fillOptionList("update-availability", AVAILABILITY);
  }

  function fillOptionList(id, values) {
    const select = document.getElementById(id);
    if (!select) return;
    const placeholder = select.options[0]?.textContent || "Choose one...";
    select.innerHTML = `<option value="">${placeholder}</option>`;
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function getSkillPool() {
    const localSkills = getLocalSkills();
    const combined = [...BASE_SKILLS, ...localSkills]
      .map(normalizeSkillLabel)
      .filter(Boolean);
    return [...new Set(combined)].sort((a, b) => a.localeCompare(b));
  }

  async function persistSkills(skills) {
    const cleaned = skills.map(normalizeSkillLabel).filter(Boolean);
    if (cleaned.length === 0) return;

    const existing = getLocalSkills();

    const merged = [...new Set([...existing, ...cleaned])].sort((a, b) => a.localeCompare(b));
    localStorage.setItem(SKILL_POOL_KEY, JSON.stringify(merged));

    if (db.saveGlobalSkills) {
      await db.saveGlobalSkills(cleaned);
    }
  }

  function getLocalSkills() {
    return JSON.parse(localStorage.getItem(SKILL_POOL_KEY) || "[]")
      .map(normalizeSkillLabel)
      .filter(Boolean);
  }

  function resolveSkillSelection(selectId, customId) {
    const custom = normalizeSkillLabel(value(customId));
    if (custom) return custom;
    return normalizeSkillLabel(value(selectId));
  }

  function normalizeSkillLabel(raw) {
    if (!raw) return "";
    return raw
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function renderNav(user) {
    const nav = document.getElementById("navbar");
    if (!nav) return;

    if (user) {
      nav.innerHTML = `
        <a href="dashboard.html">${icons.dashboard}<span>Dashboard</span></a>
        <a href="my-requests.html">${icons.requests}<span>Requests</span></a>
        <a href="profile.html">${icons.profile}<span>Profile</span></a>
        <button type="button" id="logoutBtn">${icons.logout}<span>Logout</span></button>
      `;
      nav.querySelector("#logoutBtn")?.addEventListener("click", async () => {
        await db.signOut();
        location.href = "login.html";
      });
      return;
    }

    nav.innerHTML = `
      <a href="signup.html">${icons.signup}<span>Sign Up</span></a>
      <a href="login.html">${icons.login}<span>Log In</span></a>
    `;
  }

  function setupIndex(user) {
    const status = document.getElementById("data-mode");
    if (status) {
      status.textContent = db.mode === "supabase" ? "Live database mode" : "Local mode (connect Supabase to go live)";
      status.classList.add("status-pill");
    }
    const primary = document.getElementById("primary-entry");
    const secondary = document.getElementById("secondary-entry");
    if (!primary || !secondary) return;

    if (user) {
      primary.textContent = "Go to Dashboard";
      primary.href = "dashboard.html";
      secondary.textContent = "Open Profile";
      secondary.href = "profile.html";
    }
  }

  function setupSignup() {
    const form = document.getElementById("signupForm");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const teach = resolveSkillSelection("teach", "teach-custom");
      const learn = resolveSkillSelection("learn", "learn-custom");

      const payload = {
        name: value("name"),
        email: value("email").toLowerCase(),
        password: value("password"),
        teach,
        learn,
        level: value("level"),
        availability: value("availability"),
        bio: value("bio")
      };

      if (!payload.name || !payload.email || !payload.password || !payload.teach || !payload.learn || !payload.level || !payload.availability) {
        notify("Fill every required field.");
        return;
      }
      if (payload.teach === payload.learn) {
        notify("Teaching and learning skills must be different.");
        return;
      }
      if (payload.password.length < 6) {
        notify("Password must have at least 6 characters.");
        return;
      }

      const result = await db.signUp(payload);
      if (result.error) {
        notify(result.error);
        return;
      }

      await persistSkills([payload.teach, payload.learn]);
      populateSelectOptions();

      location.href = "dashboard.html";
    });
  }

  function setupLogin() {
    const form = document.getElementById("loginForm");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = value("login-email").toLowerCase();
      const password = value("login-password");
      if (!email || !password) {
        notify("Enter both email and password.");
        return;
      }
      const result = await db.signIn(email, password);
      if (result.error) {
        notify(result.error);
        return;
      }
      location.href = "dashboard.html";
    });
  }

  async function setupDashboard(user) {
    setText("username", user.name);
    setText("teach-skill", user.teach || "Not set");
    setText("learn-skill", user.learn || "Not set");
    setText("user-level", user.level || "Beginner");

    const list = document.getElementById("match-list");
    if (!list) return;

    const [matches, requests, partners] = await Promise.all([
      db.listMatches(user),
      db.listRequests(user),
      db.listChatPartners(user)
    ]);

    renderDashboardAnalytics(user, matches, requests, partners);

    if (matches.length === 0) {
      list.innerHTML = '<div class="notice">No reciprocal matches yet. Update your skills or check back later.</div>';
      return;
    }

    list.innerHTML = "";
    matches.forEach((match) => {
      const relationship = getMatchRelationship(user.id, match.id, requests);
      const card = document.createElement("article");
      card.className = "match-card";
      card.innerHTML = `
        <h3><a href="profile.html" class="profile-link" data-profile-id="${match.id}">${escapeHtml(match.name)}</a></h3>
        <p class="card-meta"><strong>Teaches:</strong> ${escapeHtml(match.teach)}</p>
        <p class="card-meta"><strong>Learns:</strong> ${escapeHtml(match.learn)}</p>
        <p class="card-meta"><strong>Level:</strong> ${escapeHtml(match.level)}</p>
        <p class="card-meta"><strong>Availability:</strong> ${escapeHtml(match.availability)}</p>
        <div class="status-pill">Compatibility ${match.compatibility}%</div>
        <div class="card-actions">
          ${renderDashboardRequestAction(relationship, match.id)}
          <button class="ghost-btn" data-chat-id="${match.id}">Open Chat</button>
        </div>
      `;
      list.appendChild(card);
    });

    list.addEventListener("click", async (event) => {
      const profileBtn = event.target.closest(".profile-link");
      if (profileBtn) {
        localStorage.setItem("skillswap_profile_id", profileBtn.dataset.profileId);
        return;
      }

      const requestBtn = event.target.closest("[data-request-id]");
      if (requestBtn) {
        const targetId = requestBtn.getAttribute("data-request-id");
        if (!targetId) return;
        const result = await db.createRequest(user, targetId);
        if (result.error) {
          notify(result.error);
          return;
        }
        requestBtn.textContent = "Requested";
        requestBtn.disabled = true;
      }

      const chatBtn = event.target.closest("[data-chat-id]");
      if (chatBtn) {
        const targetId = chatBtn.getAttribute("data-chat-id");
        if (!targetId) return;
        localStorage.setItem("skillswap_active_chat_with", targetId);
        location.href = "chat.html";
      }
    });
  }

  function renderDashboardAnalytics(user, matches, requests, partners) {
    const grid = document.getElementById("analytics-grid");
    if (!grid) return;

    const incoming = requests.filter((row) => row.direction === "incoming");
    const incomingPending = incoming.filter((row) => row.status === "pending").length;
    const outgoingPending = requests.filter((row) => row.direction === "outgoing" && row.status === "pending").length;
    const accepted = requests.filter((row) => row.status === "accepted").length;
    const avgCompatibility = matches.length > 0
      ? Math.round(matches.reduce((sum, row) => sum + row.compatibility, 0) / matches.length)
      : 0;
    const profileStrength = calculateProfileStrength(user);
    const responseRate = incoming.length > 0
      ? Math.round(((incoming.length - incomingPending) / incoming.length) * 100)
      : 100;

    const metrics = [
      {
        label: "Reciprocal Matches",
        value: matches.length,
        hint: matches.length > 0 ? `${avgCompatibility}% avg compatibility` : "No active reciprocal pair yet"
      },
      {
        label: "Incoming Requests",
        value: incomingPending,
        hint: incomingPending > 0 ? "Pending your response" : "Inbox is clear"
      },
      {
        label: "Outgoing Requests",
        value: outgoingPending,
        hint: outgoingPending > 0 ? "Waiting on peers" : "No pending outgoing request"
      },
      {
        label: "Accepted Swaps",
        value: accepted,
        hint: accepted > 0 ? "Great progress" : "Accept a request to start"
      },
      {
        label: "Active Chats",
        value: partners.length,
        hint: partners.length > 0 ? "Conversations in motion" : "No ongoing chat yet"
      },
      {
        label: "Profile Strength",
        value: `${profileStrength}%`,
        hint: `Response rate ${responseRate}%`,
        meter: profileStrength
      }
    ];

    grid.innerHTML = metrics
      .map((metric) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(metric.label)}</div>
          <div class="metric-value">${escapeHtml(metric.value)}</div>
          <div class="metric-hint">${escapeHtml(metric.hint)}</div>
          ${typeof metric.meter === "number" ? `<div class="metric-progress"><span style="width:${Math.max(0, Math.min(metric.meter, 100))}%"></span></div>` : ""}
        </article>
      `)
      .join("");
  }

  function calculateProfileStrength(user) {
    const checks = [
      Boolean(user.name),
      Boolean(user.teach),
      Boolean(user.learn),
      Boolean(user.level),
      Boolean(user.availability),
      Boolean(user.bio && user.bio.length >= 20)
    ];
    const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return Math.max(10, score);
  }

  function getMatchRelationship(currentUserId, targetUserId, requests) {
    const pairRequests = requests.filter(
      (row) =>
        (row.requesterId === currentUserId && row.targetId === targetUserId) ||
        (row.requesterId === targetUserId && row.targetId === currentUserId)
    );

    const latest = pairRequests[0];
    if (!latest) return "none";

    if (latest.status === "accepted") return "accepted";
    if (latest.status === "pending" && latest.requesterId === currentUserId) return "outgoing-pending";
    if (latest.status === "pending" && latest.requesterId === targetUserId) return "incoming-pending";
    return "none";
  }

  function renderDashboardRequestAction(relationship, targetId) {
    if (relationship === "accepted") {
      return '<span class="status-pill accepted">Swap Active</span>';
    }
    if (relationship === "incoming-pending") {
      return '<a href="my-requests.html" class="ghost-btn">Review Request</a>';
    }
    if (relationship === "outgoing-pending") {
      return '<button class="swap-btn" data-request-id="' + escapeHtml(targetId) + '" disabled>Requested</button>';
    }
    return '<button class="swap-btn" data-request-id="' + escapeHtml(targetId) + '">Propose Swap</button>';
  }

  async function setupProfile(user) {
    const selectedProfileId = localStorage.getItem("skillswap_profile_id");
    const visitingOtherProfile = selectedProfileId && selectedProfileId !== user.id;

    if (visitingOtherProfile) {
      const profile = await db.getProfileById(selectedProfileId);
      if (profile) {
        setText("profile-name", `${profile.name}`);
        setText("teaches", profile.teach || "Not set");
        setText("learns", profile.learn || "Not set");
        setText("current-level", profile.level || "Not set");
        setText("current-availability", profile.availability || "Not set");
        setText("current-bio", profile.bio || "No bio yet.");

        const section = document.getElementById("profile-actions");
        if (section) {
          section.innerHTML = `<button class="swap-btn" id="openChat">${icons.chat}Start Chat</button>`;
          section.querySelector("#openChat")?.addEventListener("click", () => {
            localStorage.setItem("skillswap_active_chat_with", profile.id);
            location.href = "chat.html";
          });
        }
      }

      document.getElementById("update-section")?.classList.add("hidden");
      document.getElementById("history-section")?.classList.add("hidden");
      return;
    }

    localStorage.removeItem("skillswap_profile_id");
    setText("profile-name", `Welcome, ${user.name}`);
    setText("teaches", user.teach || "Not set");
    setText("learns", user.learn || "Not set");
    setText("current-level", user.level || "Not set");
    setText("current-availability", user.availability || "Not set");
    setText("current-bio", user.bio || "No bio yet.");

    const updateForm = document.getElementById("updateForm");
    if (updateForm) {
      setValue("update-name", user.name);
      setValue("update-teach", user.teach);
      setValue("update-learn", user.learn);
      setValue("update-level", user.level);
      setValue("update-availability", user.availability);
      setValue("update-bio", user.bio);

      updateForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const teach = resolveSkillSelection("update-teach", "update-teach-custom");
        const learn = resolveSkillSelection("update-learn", "update-learn-custom");

        const patch = {
          name: value("update-name"),
          teach,
          learn,
          level: value("update-level"),
          availability: value("update-availability"),
          bio: value("update-bio")
        };
        if (!patch.name || !patch.teach || !patch.learn || !patch.level || !patch.availability) {
          notify("Fill all required profile fields.");
          return;
        }
        if (patch.teach === patch.learn) {
          notify("Teaching and learning skills must be different.");
          return;
        }

        const result = await db.updateProfile(user, patch);
        if (result.error) {
          notify(result.error);
          return;
        }

        await persistSkills([patch.teach, patch.learn]);
        populateSelectOptions();

        location.reload();
      });
    }

    const history = document.getElementById("chat-history");
    if (history) {
      const partners = await db.listChatPartners(user);
      history.innerHTML = "";
      if (partners.length === 0) {
        history.innerHTML = "<li>No active conversations yet.</li>";
        return;
      }
      partners.forEach((partner) => {
        const li = document.createElement("li");
        li.innerHTML = `<a href="chat.html" data-chat-with="${partner.id}">${escapeHtml(partner.name)}</a>`;
        history.appendChild(li);
      });

      history.addEventListener("click", (event) => {
        const link = event.target.closest("[data-chat-with]");
        if (!link) return;
        localStorage.setItem("skillswap_active_chat_with", link.getAttribute("data-chat-with"));
      });
    }
  }

  async function setupRequests(user) {
    const list = document.getElementById("request-list");
    if (!list) return;

    const requests = await db.listRequests(user);
    if (requests.length === 0) {
      list.innerHTML = '<div class="notice">No swap requests yet.</div>';
      return;
    }

    list.innerHTML = "";
    requests.forEach((request) => {
      const counterpart = request.direction === "outgoing" ? request.target : request.requester;
      const card = document.createElement("article");
      card.className = "match-card";
      card.innerHTML = `
        <h3>${escapeHtml(counterpart?.name || "Unknown")}</h3>
        <p class="card-meta"><strong>Can Teach:</strong> ${escapeHtml(counterpart?.teach || "-")}</p>
        <p class="card-meta"><strong>Wants:</strong> ${escapeHtml(counterpart?.learn || "-")}</p>
        <div class="status-pill ${escapeHtml(request.status)}">${escapeHtml(request.status)}</div>
        <div class="card-actions">
          ${request.direction === "incoming" && request.status === "pending" ? `<button class="accept-btn" data-accept-id="${request.id}" data-chat-id="${request.requesterId}">Accept</button>` : ""}
          ${request.direction === "incoming" && request.status === "pending" ? `<button class="ghost-btn" data-reject-id="${request.id}">Decline</button>` : ""}
          <button class="cancel-btn" data-cancel-id="${request.id}">Remove</button>
        </div>
      `;
      list.appendChild(card);
    });

    list.addEventListener("click", async (event) => {
      const acceptBtn = event.target.closest("[data-accept-id]");
      if (acceptBtn) {
        const requestId = acceptBtn.getAttribute("data-accept-id");
        const chatWith = acceptBtn.getAttribute("data-chat-id");
        if (!requestId || !chatWith) return;
        const result = await db.setRequestStatus(user, requestId, "accepted");
        if (result.error) {
          notify(result.error);
          return;
        }
        localStorage.setItem("skillswap_active_chat_with", chatWith);
        location.href = "chat.html";
        return;
      }

      const rejectBtn = event.target.closest("[data-reject-id]");
      if (rejectBtn) {
        const requestId = rejectBtn.getAttribute("data-reject-id");
        if (!requestId) return;
        const result = await db.setRequestStatus(user, requestId, "rejected");
        if (result.error) {
          notify(result.error);
          return;
        }
        location.reload();
        return;
      }

      const cancelBtn = event.target.closest("[data-cancel-id]");
      if (cancelBtn) {
        const requestId = cancelBtn.getAttribute("data-cancel-id");
        if (!requestId) return;
        await db.cancelRequest(user, requestId);
        location.reload();
      }
    });
  }

  async function setupChat(user) {
    const targetId = new URLSearchParams(location.search).get("with") || localStorage.getItem("skillswap_active_chat_with");
    if (!targetId) {
      notify("Choose someone to chat with from Dashboard or Profile.");
      return;
    }

    localStorage.setItem("skillswap_active_chat_with", targetId);
    const peer = await db.getProfileById(targetId);
    if (!peer) {
      notify("Chat user not found.");
      return;
    }

    setText("chat-user", peer.name);
    await renderChatMessages(user, targetId);

    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    if (!form || !input) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const result = await db.sendMessage(user, targetId, text);
      if (result.error) {
        notify(result.error);
        return;
      }
      input.value = "";
      await renderChatMessages(user, targetId);
    });

    if (chatRefreshHandle) clearInterval(chatRefreshHandle);
    chatRefreshHandle = setInterval(async () => {
      await renderChatMessages(user, targetId, true);
    }, 3000);

    window.addEventListener("beforeunload", () => {
      if (chatRefreshHandle) clearInterval(chatRefreshHandle);
    });
  }

  async function renderChatMessages(user, peerId, silent = false) {
    const box = document.getElementById("chat-box");
    if (!box) return;
    const list = await db.getMessages(user, peerId);
    const previousHeight = box.scrollHeight;
    box.innerHTML = "";

    if (list.length === 0) {
      box.innerHTML = '<div class="notice">No messages yet. Start the conversation.</div>';
      return;
    }

    list.forEach((message) => {
      const bubble = document.createElement("div");
      bubble.className = `message ${message.senderId === user.id ? "you" : "them"}`;
      bubble.textContent = message.content;
      box.appendChild(bubble);
    });

    if (!silent || box.scrollHeight > previousHeight) {
      box.scrollTop = box.scrollHeight;
    }
  }

  function value(id) {
    return document.getElementById(id)?.value?.trim() || "";
  }

  function setValue(id, text) {
    const el = document.getElementById(id);
    if (el) el.value = text || "";
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function notify(message) {
    alert(message);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
