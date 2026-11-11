/**
 * Configuration interface manager.
 * Renders the SiYuan settings panel, handles user inputs (credentials, preferences),
 * and routes manual trigger actions (import/export, repository reset).
 */

import { Dialog, showMessage, Setting } from "siyuan";
import { t, availableLocales, langs, setLocale, getLocale } from "../shared-utils/i18n";
import GitHubSyncPlugin from "../index";
import { SyncEngine } from "../engine/SyncEngine";
import { GitPluginConfig, SyncError } from "../shared-utils/types";
import { SyncProgressUI } from "./ProgressUI";

export class SettingsUI {
	constructor(
		private plugin: GitHubSyncPlugin,
		private engine: SyncEngine,
	) {
this.engine.removeAllListeners()

                // llxl0 fork: only show the progress dialog for MANUAL syncs.
                // Background (realtime) syncs used to pop a "GitHub Sync" window
                // every 10 seconds — deeply annoying and pointless for the user.
                this.engine.on(
                        "progress",
                        (percent: number, status: string, details: string) => {
                                if (!this.plugin.isManualSync) return;
                                this.updateProgressUI(percent, status, details);
                        },
                );

		this.engine.on("error", (err: SyncError | string) => {
    const msg = err instanceof SyncError ? err.message : String(err);
    showMessage(msg, 6000, "error");
		});
	}

	private updateProgressUI = (() => {
        // UI Progress bar Instance
        let ui: SyncProgressUI | null = null;

        return (pct: number, status: string, details: string): void => {
            // Instantiate the UI on the first event emission
            if (!ui || ui.isDestroyed) {
                ui = new SyncProgressUI("GitHub Sync", () => {
                    ui = null; // Clean up memory when the dialog closes
                });
            }

            // Route the UI update based on completion percentage
            if (pct >= 100) {
                ui.finish(details, true);
            } else {
                ui.update(pct, status, details);
            }
        };
    })();

	/**
	 * Build the plugin settings page.
	 *
	 * All input elements are captured in closures so the "Save" handler can
	 * read their values without re-querying the DOM. The token and encryption
	 * password fields have a show/hide eye toggle.
	 */
	public registerSettings(): void {
		// Abstract DOM creation for inputs
		const inputFields = {
			username: this.mkInput(t("setting.github_user"), this.plugin.config.username),
			repo: this.mkInput(t("setting.github_repo"), this.plugin.config.repo),
			token: this.mkInput(
				t("setting.github_token"),
				this.plugin.config.token,
				"password",
			),
			groqKey: this.mkInput(
				t("setting.groq_key"),
				this.plugin.config.groqKey,
				"password",
			),
			encryptionPassword: this.mkInput(
				t("setting.encryption_password"),
				this.plugin.config.encryptionPassword || "",
				"password",
			),
			showDiff: this.mkInput(t("setting.show_diff"), this.plugin.config.showDiff ? "true" : "false", "checkbox"),
			language: this.mkSelect(t("setting.language"), this.plugin.config.language || "en"),
			syncMode: this.mkSelect(
				"同步模式 (sync mode)",
				this.plugin.config.syncMode || "cloud",
				[
					{ value: "cloud", label: "☁ 云端 GitHub 同步" },
					{ value: "lan", label: "🏠 仅局域网同步" },
					{ value: "off", label: "⛔ 不同步（本地）" },
				],
			),
			lanPeers: this.mkInput(
				"局域网对端 (LAN peers, 逗号分隔 IP)",
				(this.plugin.config.lanPeers || []).join(","),
			),
			actions: null, // will be populated later

		};

		// Callback that updates the input fields from the config parameter
		// used for the import button to update this UI after importing
		// only the current fields are updated
		// so that only confirmCallback writes to the json config file
		// and a "save" action is required as the only way to save the config
		const updateCurrentFieldsFromNewConfig = (cfg: GitPluginConfig) => {
			inputFields.username.value = cfg.username || "";
			inputFields.repo.value = cfg.repo || "";
			inputFields.token.value = cfg.token || "";
			inputFields.groqKey.value = cfg.groqKey || "";
			inputFields.encryptionPassword.value = cfg.encryptionPassword || "";
			inputFields.showDiff.checked = !!cfg.showDiff;
			inputFields.language.value = cfg.language || "en";
			inputFields.syncMode.value = cfg.syncMode || "cloud";
			inputFields.lanPeers.value = (cfg.lanPeers || []).join(",");
		};

		// populate action buttons
		inputFields.actions = this.populateActionButtons(updateCurrentFieldsFromNewConfig);
				// [rt46] self-update button
				this.plugin.setting.addItem({
					title: "插件自更新 (从 llxl0/siyuan-plugin rt-stable 拉取)",
					createActionElement: () => {
						const btn = document.createElement("button");
						btn.className = "b3-button b3-button--outline";
						btn.textContent = "检查更新";
						btn.onclick = () => this.plugin.checkSelfUpdate();
						return btn;
					},
				});

		// Dynamic language change callback
		inputFields.language.onchange = () => {
			const newLang = inputFields.language.value;
			try {
				setLocale(newLang);
				showMessage(t("msg.language_changed"), 4000);
				(window as Window).__github_sync_locale = getLocale();
			} catch (err) {
				console.error("[GitHub Sync] Failed to set locale from language selector:", err);
				showMessage(t("msg.language_change_failed"), 6000, "error");
			}
		}

		// define settings object
		this.plugin.setting = new Setting({
			// callback for confirm button click
			confirmCallback: async () => {
				// save the values from the input fields into the plugin config
				this.plugin.config.username = inputFields.username.value.trim();
				this.plugin.config.repo = inputFields.repo.value.trim();
				this.plugin.config.token = inputFields.token.value.trim();
				this.plugin.config.groqKey = inputFields.groqKey.value.trim();
				this.plugin.config.encryptionPassword = inputFields.encryptionPassword.value.trim();
				this.plugin.config.showDiff = inputFields.showDiff.checked;
				this.plugin.config.language = inputFields.language.value;
				const mode = inputFields.syncMode.value;
				this.plugin.config.syncMode =
					(mode === "off" || mode === "lan" || mode === "cloud") ? mode : "cloud";
				this.plugin.config.lanPeers = inputFields.lanPeers.value
					.split(",").map((v: string) => v.trim()).filter(Boolean);
								// [rt43] collect per-notebook modes
								this.plugin.config.nbSyncModes = {};
								document.querySelectorAll("#nb-sync-list select").forEach((sel) => {
									const box = (sel as HTMLSelectElement).dataset.box;
									const v = (sel as HTMLSelectElement).value as any;
									if (box && v) this.plugin.config.nbSyncModes![box] = v;
								});


				await this.plugin.saveData(
					"github-sync-config.json",
					this.plugin.config,
				);
				                // [rt43] render per-notebook sync modes under the confirm button
                try {
                        const nbRes = await fetch("/api/notebook/lsNotebooks", { method: "POST", body: "{}" });
								const nbJson = await nbRes.json();
								const nbs: { id: string; name: string }[] =
									(nbJson?.data?.notebooks) || [];
                        const listEl = document.querySelector("#nb-sync-list");
                        if (listEl) {
                                listEl.innerHTML = "";
                                for (const nb of nbs) {
                                        const row = document.createElement("div");
                                        row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0;";
                                        const label = document.createElement("span");
                                        label.style.cssText = "flex:1;font-size:13px;";
                                        label.textContent = nb.name || nb.id;
                                        const sel = document.createElement("select");
                                        sel.className = "b3-select";
                                        sel.style.cssText = "width:150px;font-size:12px;";
                                        sel.dataset.box = nb.id;
                                        for (const [v, lbl] of [["", "跟随全局"], ["cloud", "☁ 云端"], ["lan", "🏠 局域网"], ["off", "⛔ 不同步"]] as [string, string][]) {
                                                const o = document.createElement("option");
                                                o.value = v;
                                                o.textContent = lbl;
                                                sel.appendChild(o);
                                        }
                                        sel.value = this.plugin.config.nbSyncModes?.[nb.id] || "";
                                        row.appendChild(label);
                                        row.appendChild(sel);
                                        listEl.appendChild(row);
                                }
                        }
                } catch (e) {
                        console.warn("[RT] nb list render failed", e);
                }
                showMessage(t("msg.saved"));
			},
		});

		// --------------------------------------------
		// items population
		// --------------------------------------------

		// username
		this.plugin.setting.addItem({
				title: t("setting.github_user"),
				createActionElement: () => inputFields.username,
			});

		// repo
		this.plugin.setting.addItem({
				title: t("setting.github_repo"),
				createActionElement: () => inputFields.repo,
			});

		// PAT (+ visibility toggle)
		this.plugin.setting.addItem({
				title: t("setting.github_token"),
				// Wrap the token input to automatically append the visibility toggle
				createActionElement: () => this.wrapWithToggle(inputFields.token),
			});

		// Groq API key (+ visibility toggle)
		this.plugin.setting.addItem({
				title: t("setting.groq_key"),
				// Wrap the token input to automatically append the visibility toggle
				createActionElement: () => this.wrapWithToggle(inputFields.groqKey),
			});

		// encryption password item (+ visibility toggle)
		this.plugin.setting.addItem({
			title: t("setting.encryption_password"),
			createActionElement: () => this.wrapWithToggle(inputFields.encryptionPassword),
		});

		// show diff checkbox
		this.plugin.setting.addItem({
			title: t("setting.show_diff"),
			createActionElement: () => inputFields.showDiff,
		});

		// language select
		this.plugin.setting.addItem({
			title: t("setting.language"),
			createActionElement: () => inputFields.language,
		});
			// [rt43] per-notebook sync modes
			this.plugin.setting.addItem({
				title: "每本笔记本的同步模式",
				createActionElement: () => this.mkNbSyncList(),
			});

		// action buttons
		this.plugin.setting.addItem({
			title: t("setting.actions"),
			createActionElement: () => inputFields.actions,
		});
	}

	/** [rt43] Container div; rows are rendered on creation. */
	private mkNbSyncList(): HTMLElement {
		const el = document.createElement("div");
		el.id = "nb-sync-list";
		el.style.cssText = "width:100%;max-height:220px;overflow:auto;margin:6px 0;padding:4px 8px;border:1px solid var(--b3-border-color);border-radius:6px;";
		this.renderNbSyncRows(el);
		return el;
	}

	/** [rt43] Fetch notebooks and render one selector per notebook. */
	private async renderNbSyncRows(el: HTMLElement): Promise<void> {
		try {
			const res = await fetch("/api/notebook/lsNotebooks", { method: "POST", body: "{}" });
			const json = await res.json();
			const nbs: { id: string; name: string }[] = json?.data?.notebooks || [];
			el.innerHTML = "";
			const modes: [string, string][] = [ ["", "跟随全局"], ["cloud", "☁ 云端"], ["lan", "🏠 局域网"], ["off", "⛔ 不同步"] ];
			for (const nb of nbs) {
				const row = document.createElement("div");
				row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0;";
				const label = document.createElement("span");
				label.style.cssText = "flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
				label.textContent = nb.name || nb.id;
				const sel = document.createElement("select");
				sel.className = "b3-select";
				sel.style.cssText = "width:140px;font-size:12px;";
				sel.dataset.box = nb.id;
				for (const [v, lbl] of modes) {
					const o = document.createElement("option");
					o.value = v;
					o.textContent = lbl;
					sel.appendChild(o);
				}
				sel.value = this.plugin.config.nbSyncModes?.[nb.id] || "";
				row.appendChild(label);
				row.appendChild(sel);
				el.appendChild(row);
			}
		} catch (e) {
			console.warn("[RT] nb rows render failed", e);
		}
	}

	private mkSelect(ph: string, val: string, options?: { value: string; label: string }[]) {
		const el: HTMLSelectElement = document.createElement("select");
		el.className = "b3-select fn__size300";
		el.style.cssText = "flex:0 1 300px;max-width:100%;padding:4px 8px;font-size:14px;";
		el.title = ph;
		if (options) {
			options.forEach((o) => {
				const option = document.createElement("option");
				option.value = o.value;
				option.textContent = o.label;
				if (o.value === val) option.selected = true;
				el.appendChild(option);
			});
		} else {
			availableLocales().forEach((lang) => {
				const option = document.createElement("option");
				option.value = lang;
				option.textContent = langs[lang];
				if (lang === val) option.selected = true;
				el.appendChild(option);
			});
		}
		return el;
	}

	private mkInput(ph: string, val: string, type = "text") {
		const el: HTMLInputElement = document.createElement("input");
		el.type = type;
		el.title = ph;
		switch (type) {
			case "checkbox":
				el.style.cssText = "width:16px;height:16px;cursor:pointer;margin:0;";
				el.checked = val === "true";
				break;
			case "text":
				el.className = "b3-text-field fn__size300";
				el.style.cssText = "flex:0 1 300px;max-width:100%;";
				el.value = val;
				break;
			case "password":
				el.className = "b3-text-field";
				el.placeholder = ph;
				el.value = val;
				break;
				default:
					throw new Error(`Unsupported input type: ${type}`);
			}
			return el;
	}

	private mkActionButton(label: string, onClick: (btn?: HTMLButtonElement) => void | Promise<void>): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "b3-button b3-button--outline";
		btn.style.cssText = "flex:0 0 auto;min-width:max-content;white-space:nowrap;padding:6px 12px;";
		btn.textContent = label;

		// assign click handler
		btn.onclick = () => onClick(btn);
		return btn;
	}

	private mkVisibilityToggle(targetInput: HTMLInputElement): HTMLButtonElement {
		// create visibility toggle
		const toggleBtn = document.createElement("button");
		toggleBtn.type = "button";
		toggleBtn.className = "b3-button b3-button--outline";
		toggleBtn.style.cssText = "margin-left:8px;padding:4px 8px;font-size:14px;";
		toggleBtn.style.cssText = "margin-left:8px;padding:4px 8px;font-size:14px;line-height:0;display:flex;align-items:center;";
		toggleBtn.title = "显示/隐藏";
		toggleBtn.innerHTML = '<svg style="width:16px;height:16px"><use xlink:href="#iconEyeoff"></use></svg>';

		// visibility toggle handler
		toggleBtn.onclick = () => {
			const isPassword = targetInput.type === "password";
			targetInput.type = isPassword ? "text" : "password";
			const use = toggleBtn.querySelector("use");
			const icon = isPassword ? "#iconEye" : "#iconEyeoff";
			if (use) {
				use.setAttribute("xlink:href", icon);
				use.setAttribute("href", icon);
			}
		};

		return toggleBtn;
	}

	private wrapWithToggle(input: HTMLInputElement): HTMLDivElement {
    const wrap = document.createElement("div");

    wrap.style.cssText =
        "display:flex;gap:8px;align-items:center;flex:0 1 300px;max-width:100%;min-width:0;";

    input.style.cssText =
        "flex:1 1 auto;min-width:0;width:auto;";

    const toggle = this.mkVisibilityToggle(input);
    toggle.style.flex = "0 0 auto";

    wrap.appendChild(input);
    wrap.appendChild(toggle);
    return wrap;
	}

	private populateActionButtons(onImportComplete: (cfg: GitPluginConfig) => void): HTMLDivElement {
		const buttonsContainer = document.createElement("div");
		buttonsContainer.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
		buttonsContainer.title = t("setting.actions");

		// define button label and click handling logic
		const buttons = {
			testGitHub: this.mkActionButton(t("button.test_github"), async (btn) => {
				btn.disabled = true;
				await this.engine.testGitHubConnection();
				btn.disabled = false;
			}),
			export: this.mkActionButton(t("button.export"), async () => {
				this.engine.exportConfig(this.plugin.config);
			}),
			import: this.mkActionButton(t("button.import"), async () => {
				const newConfig = await this.engine.importConfig(this.plugin.config);
				// scrap invalid config
				if (!newConfig) {
					return;
				}
				// update UI
				onImportComplete(newConfig)
			}),
			emptyRepo: this.mkActionButton(t("button.reset_repo"), async (btn) => {
				btn.disabled = true;
				// define warning dialog in UI
				const dialog = new Dialog({
					title: t("dialog.reset_repo_title"),
					content: `
            <div class="b3-dialog__content" style="padding:16px;">
                <div style="margin-bottom:12px;line-height:1.7;white-space:pre-wrap;">${t("dialog.reset_repo_warning")}</div>
            </div>
            <div class="b3-dialog__action" style="padding:8px 16px;border-top:1px solid var(--b3-border-color);">
                <button id="remove-encryption-confirm" class="b3-button b3-button--outline b3-button--error">${t("button.confirm")}</button>
                <button id="remove-encryption-cancel" class="b3-button b3-button--outline" style="margin-left:8px;">${t("button.close")}</button>
            </div>
        `,
					width: window.innerWidth < 600 ? `${window.innerWidth - 32}px` : "700px",
				});
				this.engine.resetRepoDialog(dialog);
				btn.disabled = false;
			}),
		}

		// populate div with buttons
		for (const btn of Object.values(buttons)) {
			buttonsContainer.appendChild(btn);
		}

		return buttonsContainer;
	}
}