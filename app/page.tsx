"use client";

import { useState, useCallback } from "react";

type FormState = "idle" | "validating" | "submitting" | "processing" | "complete" | "error";

interface FormErrors {
  businessName?: string;
  gbpUrl?: string;
  websiteUrl?: string;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "complete";
}

const GBP_URL_PATTERN =
  /^https?:\/\/(maps\.app\.goo\.gl|g\.co\/kgs|g\.page|share\.google|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|business\.google\.com|search\.google\.com\/local)/i;

function validateGbpUrl(url: string): string | undefined {
  if (!url.trim()) return "GBP URL is required";
  if (!GBP_URL_PATTERN.test(url)) {
    return "Enter a valid Google Maps or Business Profile URL (e.g. maps.app.goo.gl/..., google.com/maps/..., g.co/kgs/..., or g.page/...)";
  }
  return undefined;
}

function validateWebsiteUrl(url: string): string | undefined {
  if (!url.trim()) return "Website URL is required";
  if (!/^https?:\/\/.+\..+/i.test(url)) {
    return "Enter a valid URL starting with http:// or https://";
  }
  return undefined;
}

function validateBusinessName(name: string): string | undefined {
  if (!name.trim()) return "Business name is required";
  if (name.trim().length < 2) return "Business name must be at least 2 characters";
  return undefined;
}

const PROGRESS_STEPS: string[] = [
  "Resolving business profile",
  "Collecting GBP data",
  "Analyzing reviews",
  "Checking rankings across geo-grid",
  "Auditing citations & NAP",
  "Running website audit",
  "Analyzing competitors",
  "Generating AI insights",
  "Building report",
];

export default function HomePage() {
  const [businessName, setBusinessName] = useState("");
  const [gbpUrl, setGbpUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formState, setFormState] = useState<FormState>("idle");
  const [progressIndex, setProgressIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportUuid, setReportUuid] = useState<string | null>(null);

  const validateAll = useCallback((): boolean => {
    const newErrors: FormErrors = {
      businessName: validateBusinessName(businessName),
      gbpUrl: validateGbpUrl(gbpUrl),
      websiteUrl: validateWebsiteUrl(websiteUrl),
    };
    setErrors(newErrors);
    setTouched({ businessName: true, gbpUrl: true, websiteUrl: true });
    return !newErrors.businessName && !newErrors.gbpUrl && !newErrors.websiteUrl;
  }, [businessName, gbpUrl, websiteUrl]);

  const handleBlur = (field: keyof FormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === "businessName") setErrors((e) => ({ ...e, businessName: validateBusinessName(businessName) }));
    if (field === "gbpUrl") setErrors((e) => ({ ...e, gbpUrl: validateGbpUrl(gbpUrl) }));
    if (field === "websiteUrl") setErrors((e) => ({ ...e, websiteUrl: validateWebsiteUrl(websiteUrl) }));
  };

  const simulateProgress = () => {
    let step = 0;
    setProgressIndex(0);
    const interval = setInterval(() => {
      step++;
      if (step >= PROGRESS_STEPS.length) {
        clearInterval(interval);
        return;
      }
      setProgressIndex(step);
    }, 2500);
    return interval;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;

    setFormState("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/report/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          gbpUrl: gbpUrl.trim(),
          websiteUrl: websiteUrl.trim(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Failed to create report" }));

        // Handle missing API keys (503) — build a helpful, specific message.
        if (body.error === "MISSING_API_KEYS" && Array.isArray(body.missingKeys)) {
          const list = body.missingKeys
            .map((k: { key: string; purpose: string; getUrl: string }) =>
              `• ${k.key} — ${k.purpose} (${k.getUrl})`
            )
            .join("\n");
          throw new Error(
            `Server is not configured for live audits. The following API keys are missing:\n\n${list}\n\nSetup: cp .env.local.template .env.local, add the keys above, then restart the dev server.`
          );
        }

        throw new Error(body.message || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setReportUuid(data.uuid);
      setFormState("processing");

      const progressInterval = simulateProgress();

      // Poll for completion (max 40 attempts = ~2 minutes)
      let pollAttempts = 0;
      const MAX_POLL_ATTEMPTS = 40;
      const pollInterval = setInterval(async () => {
        pollAttempts++;
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          clearInterval(pollInterval);
          clearInterval(progressInterval);
          setFormState("error");
          setErrorMessage("Report generation is taking longer than expected. Please try again.");
          return;
        }
        try {
          const statusRes = await fetch(`/api/report/${data.uuid}/status`);
          if (!statusRes.ok) return;
          const status = await statusRes.json();

          if (status.status === "complete") {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            setProgressIndex(PROGRESS_STEPS.length - 1);
            setFormState("complete");
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            setFormState("error");
            setErrorMessage(status.error || "Report generation failed. Please try again.");
          }
        } catch {
          // Polling error — keep trying until max attempts
        }
      }, 3000);
    } catch (err) {
      setFormState("error");
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  };

  const progressSteps: ProgressStep[] = PROGRESS_STEPS.map((label, i) => ({
    label,
    status: i < progressIndex ? "complete" : i === progressIndex ? "active" : "pending",
  }));

  const progressPercent = Math.round(((progressIndex + 1) / PROGRESS_STEPS.length) * 100);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#1e3a5f] flex items-center justify-center">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-[#1e3a5f]">LocalSEO Audit</span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Documentation
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-xl">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5 text-sm text-amber-700 font-medium mb-6">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
              Free Audit Report
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] tracking-tight">
              Local Business SEO Audit
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-500 max-w-md mx-auto">
              Generate a professional, data-driven audit report in under 90 seconds
            </p>
          </div>

          {/* Form Card */}
          {(formState === "idle" || formState === "validating" || formState === "submitting" || formState === "error") && (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-200 p-6 sm:p-8 space-y-5"
            >
              {formState === "error" && errorMessage && (
                <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                  <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  <span className="whitespace-pre-line">{errorMessage}</span>
                </div>
              )}

              {/* Business Name */}
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Business Name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.999 2.999 0 00.397-1.223l1.204-5.418A1.5 1.5 0 016.07 1.5h11.86a1.5 1.5 0 011.47 1.208l1.203 5.418A2.999 2.999 0 0021 9.349" />
                    </svg>
                  </div>
                  <input
                    id="businessName"
                    type="text"
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      if (touched.businessName) setErrors((prev) => ({ ...prev, businessName: validateBusinessName(e.target.value) }));
                    }}
                    onBlur={() => handleBlur("businessName")}
                    placeholder="e.g. Dhivya Dentals"
                    className={`block w-full rounded-lg border py-3 pl-11 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                      touched.businessName && errors.businessName
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-slate-300 focus:border-[#1e3a5f] focus:ring-blue-100"
                    }`}
                  />
                </div>
                {touched.businessName && errors.businessName && (
                  <p className="mt-1.5 text-xs text-red-600">{errors.businessName}</p>
                )}
              </div>

              {/* GBP URL */}
              <div>
                <label htmlFor="gbpUrl" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Google Business Profile URL
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                  </div>
                  <input
                    id="gbpUrl"
                    type="url"
                    value={gbpUrl}
                    onChange={(e) => {
                      setGbpUrl(e.target.value);
                      if (touched.gbpUrl) setErrors((prev) => ({ ...prev, gbpUrl: validateGbpUrl(e.target.value) }));
                    }}
                    onBlur={() => handleBlur("gbpUrl")}
                    placeholder="e.g. https://maps.app.goo.gl/AbCdEf"
                    className={`block w-full rounded-lg border py-3 pl-11 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                      touched.gbpUrl && errors.gbpUrl
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-slate-300 focus:border-[#1e3a5f] focus:ring-blue-100"
                    }`}
                  />
                </div>
                {touched.gbpUrl && errors.gbpUrl && (
                  <p className="mt-1.5 text-xs text-red-600">{errors.gbpUrl}</p>
                )}
                <p className="mt-1.5 text-xs text-slate-400">
                  Find it by searching your business on Google Maps and copying the share link
                </p>
              </div>

              {/* Website URL */}
              <div>
                <label htmlFor="websiteUrl" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Website URL
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.97.633-3.794 1.71-5.275" />
                    </svg>
                  </div>
                  <input
                    id="websiteUrl"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => {
                      setWebsiteUrl(e.target.value);
                      if (touched.websiteUrl) setErrors((prev) => ({ ...prev, websiteUrl: validateWebsiteUrl(e.target.value) }));
                    }}
                    onBlur={() => handleBlur("websiteUrl")}
                    placeholder="e.g. https://www.dhivyadentals.com"
                    className={`block w-full rounded-lg border py-3 pl-11 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                      touched.websiteUrl && errors.websiteUrl
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-slate-300 focus:border-[#1e3a5f] focus:ring-blue-100"
                    }`}
                  />
                </div>
                {touched.websiteUrl && errors.websiteUrl && (
                  <p className="mt-1.5 text-xs text-red-600">{errors.websiteUrl}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={formState === "submitting"}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2a5080] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formState === "submitting" ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating audit...
                  </>
                ) : (
                  <>
                    Generate Audit Report
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400">
                Takes approximately 60-90 seconds. No account required.
              </p>
            </form>
          )}

          {/* Processing State */}
          {formState === "processing" && (
            <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-200 p-6 sm:p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-blue-50 mb-4">
                  <svg className="h-7 w-7 text-[#1e3a5f] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[#1e3a5f]">Generating Your Audit</h2>
                <p className="mt-1 text-sm text-slate-500">Analyzing {businessName}...</p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span>Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1e3a5f] transition-all duration-700 ease-out relative"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute inset-0 animate-shimmer rounded-full" />
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2.5">
                {progressSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {step.status === "complete" ? (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                    ) : step.status === "active" ? (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center relative">
                        <div className="absolute inset-0 rounded-full bg-blue-200 animate-pulse-ring" />
                        <div className="h-2.5 w-2.5 rounded-full bg-[#1e3a5f]" />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-slate-300" />
                      </div>
                    )}
                    <span className={`text-sm ${
                      step.status === "complete"
                        ? "text-emerald-700"
                        : step.status === "active"
                          ? "text-[#1e3a5f] font-medium"
                          : "text-slate-400"
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete State */}
          {formState === "complete" && reportUuid && (
            <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-200 p-6 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-50 mb-5">
                <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#1e3a5f] mb-2">Audit Complete</h2>
              <p className="text-sm text-slate-500 mb-6">
                Your report for <strong>{businessName}</strong> is ready.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={`/report/${reportUuid}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2a5080] transition-colors"
                >
                  View Report
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
                <a
                  href={`/api/report/${reportUuid}/pdf`}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download PDF
                </a>
              </div>
              <button
                onClick={() => {
                  setFormState("idle");
                  setBusinessName("");
                  setGbpUrl("");
                  setWebsiteUrl("");
                  setTouched({});
                  setErrors({});
                  setReportUuid(null);
                }}
                className="mt-4 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Generate another audit
              </button>
            </div>
          )}

          {/* Features Grid */}
          {(formState === "idle" || formState === "error") && (
            <div className="mt-10 grid grid-cols-3 gap-4 text-center">
              {[
                { icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605", label: "GBP Audit", desc: "25+ parameters" },
                { icon: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z", label: "Geo-Grid Ranks", desc: "49-point analysis" },
                { icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.97.633-3.794 1.71-5.275", label: "Website SEO", desc: "Full technical audit" },
              ].map((feat, i) => (
                <div key={i} className="rounded-xl bg-white border border-slate-200 p-4">
                  <svg className="mx-auto h-6 w-6 text-[#1e3a5f] mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={feat.icon} />
                  </svg>
                  <p className="text-sm font-medium text-slate-700">{feat.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{feat.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4">
        <p className="text-center text-xs text-slate-400">
          Built with Cursor &middot; Powered by Google APIs, Serper & Gemini
        </p>
      </footer>
    </div>
  );
}
