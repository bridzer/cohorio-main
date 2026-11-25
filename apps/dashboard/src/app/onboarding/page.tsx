"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ONBOARDING_STAGES,
  ORGANIZATION_CATEGORIES,
  STAGE_META,
  type OnboardingSession,
  type OnboardingStage,
} from "@/lib/onboarding";
import {
  CHANNEL_GROUPS,
  MARKETING_CHANNELS,
  channelById,
  recommendChannels,
  type ChannelIntent,
} from "@/lib/channels";
import {
  rankObjectives,
  type RankedObjective,
} from "@/lib/objectives";
import { providerMeta } from "../connections/catalog";
import "./wizard.css";
import "./discovery.css";
import { AssetUploader, DiscoveryQuestions, WebsiteAnalyzer } from "./discovery";

type ProfileForm = {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

const EMPTY_PROFILE: ProfileForm = {
  firstName: "",
  lastName: "",
  phone: "",
  addressLine1: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

type SaveState = "idle" | "saving" | "saved" | "error";

const NEXT_STAGE: Record<OnboardingStage, OnboardingStage | null> = {
  profile: "objective",
  objective: "brand",
  brand: "channels",
  channels: "integrations",
  integrations: "activation",
  activation: null,
};

function stageIndex(stage: OnboardingStage) {
  return ONBOARDING_STAGES.indexOf(stage);
}

export default function OnboardingWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [activeStage, setActiveStage] = useState<OnboardingStage>("profile");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [objective, setObjective] = useState<"business" | "social">("business");
  const [brandPath, setBrandPath] = useState<"import" | "build" | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [category, setCategory] = useState("");
  const [geoNote, setGeoNote] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [channels, setChannels] = useState<Record<string, ChannelIntent>>({});
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [brainSignals, setBrainSignals] = useState<{ goals: string; audience: string } | null>(
    null,
  );
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [activationInputs, setActivationInputs] = useState<{
    goals: string;
    completeness: number | null;
  } | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [profileResponse, sessionResponse, integrationsResponse] = await Promise.all([
          fetch("/api/profile", { cache: "no-store" }),
          fetch("/api/onboarding", { cache: "no-store" }),
          fetch("/api/integrations", { cache: "no-store" }),
        ]);
        const profilePayload = (await profileResponse.json()) as {
          profile?: ProfileForm | null;
          error?: string;
        };
        const sessionPayload = (await sessionResponse.json()) as {
          session?: OnboardingSession | null;
          error?: string;
        };
        if (!profileResponse.ok) {
          throw new Error(profilePayload.error ?? "Unable to load profile.");
        }
        if (!sessionResponse.ok) {
          throw new Error(sessionPayload.error ?? "Unable to load progress.");
        }
        if (cancelled) return;
        if (integrationsResponse.ok) {
          const integrationsPayload = (await integrationsResponse.json()) as {
            integrations?: { provider: string; configured: boolean }[];
          };
          setConnected(
            new Set(
              (integrationsPayload.integrations ?? [])
                .filter((item) => item.configured)
                .map((item) => item.provider),
            ),
          );
        }
        if (profilePayload.profile) {
          setProfile({ ...EMPTY_PROFILE, ...profilePayload.profile });
        }
        const nextSession = sessionPayload.session;
        setSession(nextSession ?? null);
        setActiveStage(nextSession?.currentStage ?? "profile");
        setObjective(nextSession?.objective ?? "business");
        setBrandPath(nextSession?.brandPath ?? null);
        setBusinessName(nextSession?.businessName ?? "");
        setWebsiteUrl(nextSession?.websiteUrl ?? "");
        setCategory(nextSession?.organizationCategory ?? "");
        setSelectedObjectiveId(nextSession?.selectedObjective ?? null);
        setChannels(
          Object.fromEntries(
            (nextSession?.selectedChannels ?? [])
              .filter((entry) => entry && typeof entry === "object")
              .map((entry) => [entry.id, entry.intent]),
          ),
        );
        if (nextSession) setSavedAt(nextSession.updatedAt);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load onboarding.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  async function persistSession(patch: Record<string, unknown>) {
    setSaveState("saving");
    setSaveError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as {
        session?: OnboardingSession;
        error?: string;
      };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "Unable to save progress.");
      }
      setSession(payload.session);
      setSavedAt(payload.session.updatedAt);
      setSaveState("saved");
      return payload.session;
    } catch (saveErrorValue) {
      setSaveState("error");
      setSaveError(
        saveErrorValue instanceof Error
          ? saveErrorValue.message
          : "Unable to save progress.",
      );
      return null;
    }
  }

  function queueAutosave(patch: Record<string, unknown>) {
    setSaveState("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistSession(patch);
    }, 800);
  }

  function updateProfile(next: Partial<ProfileForm>) {
    const merged = { ...profile, ...next };
    setProfile(merged);
    setError("");
    if (merged.firstName.trim() && merged.lastName.trim()) {
      queueAutosaveProfile(merged);
    }
  }

  async function persistProfile(values: ProfileForm) {
    setSaveState("saving");
    setSaveError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as {
        profile?: ProfileForm;
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error ?? "Unable to save profile.");
      }
      setProfile({ ...EMPTY_PROFILE, ...payload.profile });
      setSaveState("saved");
      return true;
    } catch (saveErrorValue) {
      setSaveState("error");
      setSaveError(
        saveErrorValue instanceof Error
          ? saveErrorValue.message
          : "Unable to save profile.",
      );
      return false;
    }
  }

  function queueAutosaveProfile(values: ProfileForm) {
    setSaveState("saving");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistProfile(values);
    }, 800);
  }

  async function suggestLocation() {
    if (!navigator.geolocation) {
      setGeoNote("Location isn't available in this browser — enter it manually.");
      return;
    }
    setGeoBusy(true);
    setGeoNote("");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }),
      );
      const { latitude, longitude } = position.coords;
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      );
      if (!response.ok) throw new Error("lookup failed");
      const place = (await response.json()) as {
        city?: string;
        locality?: string;
        principalSubdivision?: string;
        countryName?: string;
      };
      updateProfile({
        city: place.city || place.locality || profile.city,
        region: place.principalSubdivision || profile.region,
        country: place.countryName || profile.country,
      });
      setGeoNote("Suggested from your device — edit as needed. Coordinates are never stored.");
    } catch {
      setGeoNote("Couldn't detect location — enter it manually.");
    } finally {
      setGeoBusy(false);
    }
  }

  function profileProblems() {
    if (!profile.firstName.trim()) return "Enter your first name.";
    if (!profile.lastName.trim()) return "Enter your last name.";
    if (profile.phone.trim() && !/^\+[1-9]\d{7,14}$/.test(profile.phone.trim())) {
      return "Use international phone format, e.g. +14155552671.";
    }
    return "";
  }

  async function continueFrom(stage: OnboardingStage, patch: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    const next = NEXT_STAGE[stage];
    const saved = await persistSession({
      ...patch,
      stages: { [stage]: "complete" },
      ...(next ? { currentStage: next } : {}),
    });
    setBusy(false);
    if (!saved) {
      setError("Progress couldn't be saved. Check your connection and retry.");
      return;
    }
    if (next) setActiveStage(next);
  }

  async function continueProfile() {
    const problem = profileProblems();
    if (problem) {
      setError(problem);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    const profileOk = await persistProfile(profile);
    if (!profileOk) {
      setBusy(false);
      setError("Profile couldn't be saved. Check your connection and retry.");
      return;
    }
    const saved = await persistSession({
      currentStage: "objective",
      stages: { profile: "complete" },
    });
    setBusy(false);
    if (!saved) {
      setError("Progress couldn't be saved. Check your connection and retry.");
      return;
    }
    setActiveStage("objective");
  }

  function continueObjective() {
    if (objective === "social") return;
    void continueFrom("objective", { objective });
  }

  function continueBrand() {
    if (!brandPath) {
      setError("Choose whether to import an existing brand or build a new one.");
      return;
    }
    if (!businessName.trim()) {
      setError("Enter your business or organization name.");
      return;
    }
    if (brandPath === "import") {
      if (!websiteUrl.trim() || !/^https?:\/\/.+\..+/.test(websiteUrl.trim())) {
        setError("Enter the official website URL, starting with http(s)://.");
        return;
      }
      void continueFrom("brand", {
        brandPath,
        businessName: businessName.trim(),
        websiteUrl: websiteUrl.trim(),
      });
      return;
    }
    if (!category) {
      setError("Select the category that best describes your organization.");
      return;
    }
    void continueFrom("brand", {
      brandPath,
      businessName: businessName.trim(),
      organizationCategory: category,
    });
  }

  const rankedObjectives: RankedObjective[] = useMemo(
    () =>
      rankObjectives({
        organizationCategory: session?.organizationCategory ?? null,
        selectedChannelIds: Object.keys(channels),
        connectedProviders: [...connected],
        goalsText: activationInputs?.goals ?? brainSignals?.goals ?? null,
        brainCompleteness: activationInputs?.completeness ?? null,
      }),
    [session?.organizationCategory, channels, connected, activationInputs, brainSignals],
  );

  useEffect(() => {
    if (activeStage !== "activation" || activationInputs) return;
    let cancelled = false;
    void (async () => {
      try {
        const [contextResponse, gapsResponse] = await Promise.all([
          fetch("/api/marketing-context", { cache: "no-store" }),
          fetch("/api/brand-brain/gaps", { cache: "no-store" }),
        ]);
        const contextPayload = (await contextResponse.json()) as {
          context?: Record<string, Record<string, string>>;
        };
        const gapsPayload = (await gapsResponse.json()) as {
          completeness?: { overall?: number };
        };
        if (cancelled || !contextResponse.ok || !gapsResponse.ok) return;
        const get = (section: string, field: string) =>
          contextPayload.context?.[section]?.[field]?.trim() ?? "";
        setActivationInputs({
          goals: [get("goals", "businessGoal"), get("goals", "conversionAction")]
            .filter(Boolean)
            .join(" "),
          completeness:
            typeof gapsPayload.completeness?.overall === "number"
              ? gapsPayload.completeness.overall
              : null,
        });
      } catch {
        if (!cancelled) setActivationInputs({ goals: "", completeness: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStage, activationInputs]);

  useEffect(() => {
    if (
      activeStage === "activation" &&
      selectedObjectiveId === null &&
      rankedObjectives.length > 0
    ) {
      const top = rankedObjectives[0];
      if (top) {
        setSelectedObjectiveId(top.id);
        queueAutosave({ selectedObjective: top.id });
      }
    }
  }, [activeStage, selectedObjectiveId, rankedObjectives]);

  function pickObjective(id: string) {
    setSelectedObjectiveId(id);
    setError("");
    queueAutosave({ selectedObjective: id });
  }

  async function completeOnboarding() {
    if (!selectedObjectiveId || busy) return;
    setBusy(true);
    setError("");
    try {
      const save = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedObjective: selectedObjectiveId }),
      });
      const saved = (await save.json()) as { error?: string };
      if (!save.ok) throw new Error(saved.error ?? "Unable to save objective.");
      const done = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedObjective: selectedObjectiveId }),
      });
      const payload = (await done.json()) as { error?: string };
      if (!done.ok) throw new Error(payload.error ?? "Unable to complete onboarding.");
      router.push("/");
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Unable to complete onboarding.",
      );
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    const index = stageIndex(activeStage);
    if (index > 0) {
      setActiveStage(ONBOARDING_STAGES[index - 1]!);
      setError("");
    }
  }

  function channelsArray(record: Record<string, ChannelIntent>) {
    return Object.entries(record).map(([id, intent]) => ({ id, intent }));
  }

  function toggleChannel(id: string) {
    setChannels((current) => {
      const next = { ...current };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = "planning";
      }
      queueAutosave({ selectedChannels: channelsArray(next) });
      setError("");
      return next;
    });
  }

  function setChannelIntent(id: string, intent: ChannelIntent) {
    setChannels((current) => {
      const next = { ...current, [id]: intent };
      queueAutosave({ selectedChannels: channelsArray(next) });
      return next;
    });
  }

  const recommendations = useMemo(
    () =>
      recommendChannels({
        organizationCategory: session?.organizationCategory ?? null,
        goalsText: brainSignals?.goals ?? null,
        audienceText: brainSignals?.audience ?? null,
        connectedProviders: [...connected],
      }),
    [session?.organizationCategory, brainSignals, connected],
  );

  const recById = useMemo(
    () => new Map(recommendations.map((entry) => [entry.channelId, entry])),
    [recommendations],
  );

  type IntegrationRow = {
    key: string;
    name: string;
    blurb: string;
    href: string;
    connected: boolean;
    whys: string[];
    future: boolean;
  };

  const integrationRows: IntegrationRow[] = useMemo(() => {
    const byProvider = new Map<string, IntegrationRow>();
    const futures: IntegrationRow[] = [];
    const consider = (channelId: string, why: string) => {
      const channel = channelById(channelId);
      if (!channel) return;
      if (!channel.providers.length) {
        if (!futures.some((row) => row.key === `future:${channel.id}`)) {
          futures.push({
            key: `future:${channel.id}`,
            name: channel.label,
            blurb: channel.blurb,
            href: "",
            connected: false,
            whys: [why],
            future: true,
          });
        }
        return;
      }
      for (const provider of channel.providers) {
        const row =
          byProvider.get(provider) ??
          (provider === "shopify"
            ? {
                key: provider,
                name: "Shopify",
                blurb: "Your storefront, products, and orders.",
                href: "/commerce",
                connected: connected.has(provider),
                whys: [],
                future: false,
              }
            : {
                key: provider,
                name: providerMeta(provider).name,
                blurb: providerMeta(provider).blurb,
                href: "/connections",
                connected: connected.has(provider),
                whys: [],
                future: false,
              });
        if (!row.whys.includes(why)) row.whys.push(why);
        byProvider.set(provider, row);
      }
    };
    for (const id of Object.keys(channels)) {
      consider(id, `You selected ${channelById(id)?.label ?? id}`);
    }
    for (const rec of recommendations) {
      if (channels[rec.channelId]) continue;
      consider(rec.channelId, `Recommended — ${rec.reasons[0] ?? "fits your profile"}`);
    }
    return [...byProvider.values(), ...futures];
  }, [channels, recommendations, connected]);

  useEffect(() => {
    if (activeStage !== "channels" || brainSignals || signalsLoading) return;
    setSignalsLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/marketing-context", { cache: "no-store" });
        const payload = (await response.json()) as {
          context?: Record<string, Record<string, string>>;
        };
        if (!response.ok) return;
        const get = (section: string, field: string) =>
          payload.context?.[section]?.[field]?.trim() ?? "";
        setBrainSignals({
          goals: [get("goals", "businessGoal"), get("goals", "conversionAction")]
            .filter(Boolean)
            .join(" "),
          audience: [
            get("targetAudience", "targetCompanies"),
            get("targetAudience", "primaryUseCase"),
          ]
            .filter(Boolean)
            .join(" "),
        });
      } catch {
        // Recommendations fall back to category + connections.
      }
    })();
  }, [activeStage, brainSignals, signalsLoading]);

  function canVisit(stage: OnboardingStage) {
    return session?.stages[stage] === "complete" || stage === activeStage;
  }

  const completedCount = ONBOARDING_STAGES.filter(
    (stage) => session?.stages[stage] === "complete",
  ).length;
  const percentage = Math.round((completedCount / ONBOARDING_STAGES.length) * 100);

  if (loading) {
    return (
      <main className="ob-loading">
        <div className="ob-loading-mark">C</div>
        <p>Loading your setup…</p>
      </main>
    );
  }

  return (
    <main className="ob-shell" id="main-content">
      <aside className="ob-sidebar">
        <button className="ob-brand" onClick={() => router.push("/")}>
          <span className="ob-brand-mark">C</span>
          <span>
            <strong>Cohorio</strong>
            <small>Setup</small>
          </span>
        </button>

        <div className="ob-progress-summary">
          <div>
            <span>Setup progress</span>
            <strong>{percentage}%</strong>
          </div>
          <div className="ob-progress-track">
            <span style={{ width: `${percentage}%` }} />
          </div>
          <p>
            {completedCount} of {ONBOARDING_STAGES.length} stages complete
          </p>
          <p className="ob-save" data-state={saveState} role="status">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? `Saved${savedAt ? ` · ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`
                : saveState === "error"
                  ? `Couldn't save — ${saveError || "retry soon"}`
                  : "Progress saves automatically"}
          </p>
        </div>

        <nav aria-label="Onboarding stages">
          {ONBOARDING_STAGES.map((stage, index) => {
            const status = session?.stages[stage] ?? "pending";
            const visitable = canVisit(stage);
            return (
              <button
                key={stage}
                className={stage === activeStage ? "active" : ""}
                disabled={!visitable}
                aria-current={stage === activeStage ? "step" : undefined}
                onClick={() => {
                  setActiveStage(stage);
                  setError("");
                }}
              >
                <span className={status === "complete" ? "complete" : ""}>
                  {status === "complete" ? "✓" : index + 1}
                </span>
                {STAGE_META[stage].title}
              </button>
            );
          })}
        </nav>

        <button className="ob-exit" onClick={() => router.push("/")}>
          ← Back to dashboard
        </button>
      </aside>

      <section className="ob-main">
        {error && (
          <p className="ob-error" role="alert">
            {error}
          </p>
        )}

        {activeStage === "profile" && (
          <div className="ob-pane">
            <span className="ob-kicker">Step 1 of 6 · Your profile</span>
            <h1>Tell us who is setting up.</h1>
            <p className="ob-lead">
              This stays on your account and personalizes your workspace. You can
              skip everything except your name.
            </p>
            <div className="ob-grid-2">
              <label>
                First name <em>Required</em>
                <input
                  value={profile.firstName}
                  autoComplete="given-name"
                  placeholder="Ada"
                  onChange={(event) => updateProfile({ firstName: event.target.value })}
                />
              </label>
              <label>
                Last name <em>Required</em>
                <input
                  value={profile.lastName}
                  autoComplete="family-name"
                  placeholder="Lovelace"
                  onChange={(event) => updateProfile({ lastName: event.target.value })}
                />
              </label>
            </div>
            <label>
              Phone
              <input
                value={profile.phone}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+14155552671"
                onChange={(event) => updateProfile({ phone: event.target.value })}
              />
            </label>
            <label>
              Business address or operating location
              <input
                value={profile.addressLine1}
                autoComplete="street-address"
                placeholder="Street address"
                onChange={(event) => updateProfile({ addressLine1: event.target.value })}
              />
            </label>
            <div className="ob-grid-3">
              <label>
                City
                <input
                  value={profile.city}
                  autoComplete="address-level2"
                  placeholder="Austin"
                  onChange={(event) => updateProfile({ city: event.target.value })}
                />
              </label>
              <label>
                Region
                <input
                  value={profile.region}
                  autoComplete="address-level1"
                  placeholder="Texas"
                  onChange={(event) => updateProfile({ region: event.target.value })}
                />
              </label>
              <label>
                Country
                <input
                  value={profile.country}
                  autoComplete="country-name"
                  placeholder="USA"
                  onChange={(event) => updateProfile({ country: event.target.value })}
                />
              </label>
            </div>
            <div className="ob-geo">
              <button type="button" disabled={geoBusy} onClick={() => void suggestLocation()}>
                {geoBusy ? "Detecting…" : "Use my location"}
              </button>
              {geoNote && <small>{geoNote}</small>}
            </div>
            <footer className="ob-actions">
              <button type="button" onClick={() => router.push("/")}>
                Skip for now
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void continueProfile()}
              >
                {busy ? "Saving…" : "Save and continue"}
              </button>
            </footer>
          </div>
        )}

        {activeStage === "objective" && (
          <div className="ob-pane">
            <span className="ob-kicker">Step 2 of 6 · Objective</span>
            <h1>What are you setting up?</h1>
            <p className="ob-lead">Business is the default. You can change this later.</p>
            <div className="ob-cards" role="group" aria-label="Onboarding objective">
              <button
                type="button"
                className={objective === "business" ? "selected" : ""}
                aria-pressed={objective === "business"}
                onClick={() => {
                  setObjective("business");
                  setError("");
                  queueAutosave({ objective: "business" });
                }}
              >
                <strong>Business</strong>
                <span>Products, services, brand, and marketing. Recommended.</span>
              </button>
              <button
                type="button"
                className={objective === "social" ? "selected" : ""}
                aria-pressed={objective === "social"}
                onClick={() => {
                  setObjective("social");
                  setError("");
                  queueAutosave({ objective: "social" });
                }}
              >
                <strong>Social media</strong>
                <span>Creator and channel-first workflows.</span>
              </button>
            </div>
            {objective === "social" && (
              <div className="ob-notice" role="status">
                <strong>Coming soon.</strong>
                <p>
                  Social Media onboarding arrives in a later release. Business
                  onboarding is fully available today — switch back any time, or
                  exit and we will keep your place.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setObjective("business");
                    queueAutosave({ objective: "business" });
                  }}
                >
                  Continue with Business instead
                </button>
              </div>
            )}
            <footer className="ob-actions">
              <button type="button" onClick={goBack}>
                Back
              </button>
              {objective === "business" ? (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={continueObjective}
                >
                  {busy ? "Saving…" : "Save and continue"}
                </button>
              ) : (
                <button type="button" onClick={() => router.push("/")}>
                  Exit for now
                </button>
              )}
            </footer>
          </div>
        )}

        {activeStage === "brand" && (
          <div className="ob-pane">
            <span className="ob-kicker">Step 3 of 6 · Brand</span>
            <h1>Establish your brand.</h1>
            <p className="ob-lead">
              Import an existing brand from its website, or build a new one from
              scratch. Prefer the full questionnaire?{" "}
              <a href="/onboarding/brain">Open Brand Brain setup</a> any time.
            </p>
            <div className="ob-cards" role="group" aria-label="Brand path">
              <button
                type="button"
                className={brandPath === "import" ? "selected" : ""}
                aria-pressed={brandPath === "import"}
                onClick={() => {
                  setBrandPath("import");
                  setError("");
                  queueAutosave({ brandPath: "import" });
                }}
              >
                <strong>Import an existing brand</strong>
                <span>Start from your business name and website.</span>
              </button>
              <button
                type="button"
                className={brandPath === "build" ? "selected" : ""}
                aria-pressed={brandPath === "build"}
                onClick={() => {
                  setBrandPath("build");
                  setError("");
                  queueAutosave({ brandPath: "build" });
                }}
              >
                <strong>Build a new brand</strong>
                <span>Classify your organization, then describe it.</span>
              </button>
            </div>

            {brandPath && (
              <label>
                Business or organization name <em>Required</em>
                <input
                  value={businessName}
                  placeholder="Acme Studio"
                  onChange={(event) => {
                    setBusinessName(event.target.value);
                    setError("");
                    queueAutosave({ brandPath, businessName: event.target.value });
                  }}
                />
              </label>
            )}

            {brandPath === "import" && (
              <>
                <label>
                  Official website URL <em>Required</em>
                  <input
                    value={websiteUrl}
                    inputMode="url"
                    placeholder="https://example.com"
                    onChange={(event) => {
                      setWebsiteUrl(event.target.value);
                      setError("");
                      queueAutosave({ brandPath, websiteUrl: event.target.value });
                    }}
                  />
                </label>
                <WebsiteAnalyzer websiteUrl={websiteUrl} />
                <div className="ob-notice" role="status">
                  <strong>What happens next.</strong>
                  <p>
                    Website analysis and asset import arrive in Milestone 2. Your
                    URL is saved now, so discovery can start from it later.
                  </p>
                </div>
              </>
            )}

            {brandPath === "build" && (
              <>
                <h2 className="ob-subhead">What best describes your organization?</h2>
                <p className="ob-lead">Select one. This shapes the questions that follow.</p>
                <div className="ob-cards ob-categories" role="group" aria-label="Organization category">
                  {ORGANIZATION_CATEGORIES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={category === entry.id ? "selected" : ""}
                      aria-pressed={category === entry.id}
                      onClick={() => {
                        setCategory(entry.id);
                        setError("");
                        queueAutosave({ brandPath, organizationCategory: entry.id });
                      }}
                    >
                      <strong>{entry.title}</strong>
                      <span>{entry.description}</span>
                      <small>{entry.examples}</small>
                    </button>
                  ))}
                </div>
                {category ? <DiscoveryQuestions categoryId={category} /> : null}
              </>
            )}

            <AssetUploader />

            <footer className="ob-actions">
              <button type="button" onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={continueBrand}
              >
                {busy ? "Saving…" : "Save and continue"}
              </button>
            </footer>
          </div>
        )}

        {activeStage === "channels" && (
          <div className="ob-pane">
            <span className="ob-kicker">Step 4 of 6 · Channels</span>
            <h1>Where does your marketing happen?</h1>
            <p className="ob-lead">
              Pick what you use or plan to use.{" "}
              <span className="ob-rec-pill">Recommended</span> marks fit your
              profile, with the reason shown. Connecting happens in the next step.
            </p>
            {CHANNEL_GROUPS.map((group) => {
              const items = MARKETING_CHANNELS.filter(
                (channel) => channel.group === group.id,
              );
              if (!items.length) return null;
              return (
                <div key={group.id} className="ob-channel-group">
                  <h2 className="ob-subhead">{group.label}</h2>
                  <div className="ob-cards">
                    {items.map((channel) => {
                      const selected = channels[channel.id];
                      const rec = recById.get(channel.id);
                      const live = channel.providers.some((provider) =>
                        connected.has(provider),
                      );
                      return (
                        <div key={channel.id} className="ob-channel">
                          <button
                            type="button"
                            className={selected ? "selected" : ""}
                            aria-pressed={Boolean(selected)}
                            onClick={() => toggleChannel(channel.id)}
                          >
                            <span className="ob-channel-top">
                              <strong>{channel.label}</strong>
                              <i
                                className={live ? "on" : ""}
                                title={live ? "A connector is linked" : "Not connected"}
                                aria-hidden="true"
                              />
                            </span>
                            <span>{channel.blurb}</span>
                            {rec && (
                              <small className="ob-rec">Recommended · {rec.reasons[0]}</small>
                            )}
                          </button>
                          {selected && (
                            <span className="ob-intent" role="group" aria-label={`${channel.label} usage`}>
                              {(["using", "planning"] as const).map((intent) => (
                                <button
                                  key={intent}
                                  type="button"
                                  className={selected === intent ? "active" : ""}
                                  aria-pressed={selected === intent}
                                  onClick={() => setChannelIntent(channel.id, intent)}
                                >
                                  {intent === "using" ? "Using now" : "Planning"}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <footer className="ob-actions">
              <button type="button" onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() =>
                  void continueFrom("channels", {
                    selectedChannels: channelsArray(channels),
                  })
                }
              >
                {busy
                  ? "Saving…"
                  : `Save and continue${Object.keys(channels).length ? ` (${Object.keys(channels).length} selected)` : ""}`}
              </button>
            </footer>
          </div>
        )}

        {activeStage === "integrations" && (
          <div className="ob-pane">
            <span className="ob-kicker">Step 5 of 6 · Integrations</span>
            <h1>Connect your tools.</h1>
            <p className="ob-lead">
              Based on your channels. Connecting is optional — continue any time,
              and status refreshes when you return.
            </p>
            {integrationRows.length === 0 ? (
              <div className="ob-notice" role="status">
                <strong>No integrations suggested yet.</strong>
                <p>Select channels first, then come back for tailored connections.</p>
              </div>
            ) : (
              <ul className="ob-providers">
                {integrationRows.map((row) => (
                  <li key={row.key}>
                    <i
                      className={row.connected ? "on" : ""}
                      aria-hidden="true"
                      title={row.connected ? "Connected" : "Not connected"}
                    />
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.blurb}</small>
                      <small>{row.whys.join(" · ")}</small>
                    </span>
                    {row.future ? (
                      <em className="ob-future">No connector yet — recorded</em>
                    ) : (
                      <button type="button" onClick={() => router.push(row.href)}>
                        {row.connected ? "Manage" : "Connect"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <footer className="ob-actions">
              <button type="button" onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void continueFrom("integrations", {})}
              >
                {busy ? "Saving…" : "Save and continue"}
              </button>
            </footer>
          </div>
        )}

        {activeStage === "activation" && (
          <div className="ob-pane">
            <span className="ob-kicker">Step 6 of 6 · Activation</span>
            <h1>Choose your first objective.</h1>
            <p className="ob-lead">
              Ranked from your profile, channels, connections, and Brand Brain.
              Selecting one finishes setup and puts it on your dashboard.
            </p>
            <div className="ob-objectives" role="radiogroup" aria-label="First objective">
              {rankedObjectives.map((objective) => {
                const unmet =
                  objective.requiredIntegrations.length > 0 &&
                  !objective.requiredIntegrations.some((provider) => connected.has(provider));
                return (
                  <div
                    key={objective.id}
                    className={`ob-objective${selectedObjectiveId === objective.id ? " selected" : ""}`}
                    role="radio"
                    aria-checked={selectedObjectiveId === objective.id}
                    tabIndex={0}
                    onClick={() => pickObjective(objective.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        pickObjective(objective.id);
                      }
                    }}
                  >
                    <span className="ob-objective-top">
                      <strong>{objective.name}</strong>
                      <em className={`ob-priority ${objective.priority}`}>
                        {objective.priority} priority
                      </em>
                    </span>
                    <p>{objective.description}</p>
                    <p className="ob-objective-why">{objective.why}</p>
                    <p className="ob-objective-outcome">Outcome: {objective.outcome}</p>
                    {objective.reasons.length > 0 && (
                      <p className="ob-objective-reasons">{objective.reasons.join(" · ")}</p>
                    )}
                    {objective.relevantContext.length > 0 && (
                      <span className="ob-chips">
                        {objective.relevantContext.map((context) => (
                          <em key={context}>{context}</em>
                        ))}
                      </span>
                    )}
                    <span className="ob-objective-foot">
                      <small>Starts in: {objective.hrefLabel}</small>
                      {unmet && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push("/connections");
                          }}
                        >
                          Needs an ad account — connect
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <footer className="ob-actions">
              <button type="button" onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !selectedObjectiveId}
                onClick={() => void completeOnboarding()}
              >
                {busy ? "Finishing…" : "Complete setup and open dashboard"}
              </button>
            </footer>
          </div>
        )}
      </section>
    </main>
  );
}
