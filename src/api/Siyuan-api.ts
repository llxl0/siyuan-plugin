/**
 * SiYuan internal API wrappers.
 * Safely executes local workspace operations including file I/O, directory traversal,
 * notebook configuration, and marketplace package installations.
 */
import {
	SiYuanDirEntry,
	SiYuanNotebookConfResponse,
	NotebookManifestEntry,
	BazaarPackage,
	FileToSync,
	SKIP_ROOT_DIRS,
	SYNC_ROOT,
	SKIP_PATH_FRAGMENTS,
	LOCKED_EXTENSIONS,
	SiYuanNotebookConfigDetails,
} from "../shared-utils/types";
import { shouldSkipPath } from "../shared-utils/utils";

export class SiYuanAPI {
        /** Notebook ids currently locked by privacy-space (updated by engine). */
        public privacyLocks: Set<string> = new Set();

        /** Load locked-notebook ids from the privacy-space registry. */
        public async refreshPrivacyLocks(): Promise<void> {
                try {
                        const res = await fetch("/api/file/getFile", {
                                method: "POST",
                                body: JSON.stringify({
                                        path: "/data/storage/privacy-space.json",
                                }),
                        });
                        if (!res.ok) {
                                this.privacyLocks.clear();
                                return;
                        }
                        const text = await res.text();
                        const reg = JSON.parse(text || "{}");
                        this.privacyLocks = new Set(
                                (reg.notebooks || [])
                                        .filter((n: any) => n.locked)
                                        .map((n: any) => n.box as string),
                        );
                } catch {
                        this.privacyLocks.clear();
                }
        }

        /** List the entries of a workspace directory (`/api/file/readDir`). */
        public async readDir(path: string): Promise<SiYuanDirEntry[]> {
		try {
			const res = await fetch("/api/file/readDir", {
				method: "POST",
				body: JSON.stringify({ path }),
			});
			const json = await res.json();
			return json.code === 0 && json.data ? json.data : [];
		} catch {
			return [];
		}
	}
/** Read a file from the workspace and return its raw bytes (`/api/file/getFile`).
 *  NOTE: SiYuan's kernel returns HTTP 200 with {"code":404,...} JSON for
 *  missing files — never trust the HTTP status alone. */
	public async getFile(path: string): Promise<ArrayBuffer | null> {
		try {
			const res = await fetch("/api/file/getFile", {
				method: "POST",
				body: JSON.stringify({ path }),
			});
			if (res.status >= 200 && res.status < 300) {
				const buf = await res.arrayBuffer();
				// Kernel quirk: missing files come back as HTTP 200 with a
				// small {"code":404,"msg":"open ...: no such file"} JSON body.
				// Treat any such envelope as "file absent".
				if (buf.byteLength < 512 && buf.byteLength > 0) {
					const head = new TextDecoder()
						.decode(buf.slice(0, 24))
						.trimStart();
					if (head.startsWith('{"code"')) {
						try {
							const j = JSON.parse(new TextDecoder().decode(buf));
							if (typeof j.code === "number" && j.code !== 0) {
								console.warn(
									`[GitHub Sync] getFile kernel-rejected ${path}: code=${j.code}`,
								);
								return null;
							}
						} catch {
							/* not the error envelope — treat as real content */
						}
					}
				}
				return buf;
			} else {
				console.warn(
					`[GitHub Sync] getFile HTTP ${res.status} for ${path}`,
				);
				return null;
			}
		} catch (err) {
			console.error(`[GitHub Sync] getFile exception for ${path}:`, err);
			return null;
		}
	}
	/** Write a file to the workspace (`/api/file/putFile`, multipart upload). */
	public async putFile(path: string, content: ArrayBuffer): Promise<boolean> {
		try {
			const fd = new FormData();
			fd.append("path", path);
			fd.append("isDir", "false");

			const fileName = path.split("/").pop() || "file.sy";
			// Construct a proper File object for the SiYuan backend
			const fileObj = new File([content], fileName, {
				type: "application/octet-stream",
			});
			fd.append("file", fileObj);

			const res = await fetch("/api/file/putFile", {
				method: "POST",
				body: fd,
			});
			if (res.status >= 200 && res.status < 300) {
				const json = await res.json();
				if (json.code !== 0)
					console.warn(
						`[GitHub Sync] putFile rejected by backend for ${path}:`,
						json,
					);
				return json.code === 0;
			} else {
				console.error(`[GitHub Sync] putFile HTTP ${res.status} for ${path}`);
				return false;
			}
		} catch (err) {
			console.error(`[GitHub Sync] putFile exception for ${path}:`, err);
			return false;
		}
	}

        /** Ask SiYuan to rebuild its file-tree (needed after batch pull/deletes).
         *  NOTE: /api/filetree/refreshFiletree was REMOVED in SiYuan v3.8.9
         *  (always 404). /api/ui/reloadFiletree is the replacement. */
        public async refreshFiletree(): Promise<boolean> {
                try {
                        const res = await fetch("/api/ui/reloadFiletree", {
                                method: "POST",
                                body: "{}",
                        });
                        const json = await res.json();
                        return json.code === 0;
                } catch {
                        return false;
                }
        }

        /** Register pulled .sy docs into the SQL index WITHOUT a full-window
         *  reload. This is the "Notion-style" seamless refresh: millisecond-
         *  level per-doc index update, then a lightweight filetree reload. */
        public async upsertIndexes(paths: string[]): Promise<boolean> {
                if (!paths.length) return true;
                try {
                        const res = await fetch("/api/filetree/upsertIndexes", {
                                method: "POST",
                                body: JSON.stringify({ paths }),
                        });
                        const json = await res.json();
                        return json.code === 0;
                } catch (e) {
                        console.warn("[GitHub Sync] upsertIndexes failed:", e);
                        return false;
                }
        }

        /** Remove deleted .sy docs from the SQL index (no full reload). */
        public async removeIndexes(paths: string[]): Promise<boolean> {
                if (!paths.length) return true;
                try {
                        const res = await fetch("/api/filetree/removeIndexes", {
                                method: "POST",
                                body: JSON.stringify({ paths }),
                        });
                        const json = await res.json();
                        return json.code === 0;
                } catch (e) {
                        console.warn("[GitHub Sync] removeIndexes failed:", e);
                        return false;
                }
        }

	/** Delete a file from the workspace (`/api/file/removeFile`). */
	public async removeFile(path: string): Promise<boolean> {
		try {
			const res = await fetch("/api/file/removeFile", {
				method: "POST",
				body: JSON.stringify({ path }),
			});
			const json = await res.json();
			return json.code === 0;
		} catch {
			return false;
		}
	}

	/**
	 * List every notebook of the workspace.
	 * Returns only `{ id, name }` pairs, since that is all the manifests need.
	 */
	public async listNotebooks(): Promise<NotebookManifestEntry[]> {
		try {
			const res = await fetch("/api/notebook/lsNotebooks", {
				method: "POST",
				body: "{}",
			});
			const json = await res.json();
			if (json.code !== 0 || !json.data?.notebooks) return [];
			return json.data.notebooks.map((nb: { id: string; name?: string }) => ({
				id: nb.id,
				name: nb.name || "",
			}));
		} catch {
			return [];
		}
	}

	/** Open a notebook in the UI (`/api/notebook/openNotebook`). */
	public async openNotebook(notebookId: string): Promise<boolean> {
		try {
			const res = await fetch("/api/notebook/openNotebook", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ notebook: notebookId }),
			});
			const json = await res.json();
			return json.code === 0;
		} catch {
			return false;
		}
	}

	/** Fetch a notebook's configuration (`/api/notebook/getNotebookConf`). */
	public async getNotebookConf(
		notebookId: string,
	): Promise<SiYuanNotebookConfResponse | null> {
		try {
			const res = await fetch("/api/notebook/getNotebookConf", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ notebook: notebookId }),
			});
			const json = await res.json();
			return json.code === 0 ? json.data : null;
		} catch {
			return null;
		}
	}

	/** Update a notebook's configuration (`/api/notebook/setNotebookConf`). */
	public async setNotebookConf(
		notebookId: string,
		conf: SiYuanNotebookConfigDetails,
	): Promise<boolean> {
		try {
			const res = await fetch("/api/notebook/setNotebookConf", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ notebook: notebookId, conf }),
			});
			const json = await res.json();
			return json.code === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Read the current appearance settings (theme + light/dark mode).
	 * `mode` is 0 for light and 1 for dark.
	 */
	public async getCurrentAppearance(): Promise<{
		mode: number;
		themeLight: string;
		themeDark: string;
	} | null> {
		try {
			const res = await fetch("/api/system/getConf", {
				method: "POST",
				body: "{}",
			});
			const json = await res.json();
			if (json.code !== 0 || !json.data?.appearance) return null;
			const a = json.data.appearance;
			return {
				mode: a.mode ?? 0,
				themeLight: a.themeLight ?? "",
				themeDark: a.themeDark ?? "",
			};
		} catch {
			return null;
		}
	}

	/**
	 * Set the active theme for the given mode (light=0 / dark=1).
	 * Used after a pull that installed new themes, to restore the previously
	 * active theme saved inside the theme manifest.
	 */
	public async setActiveTheme(
		themeDir: string,
		mode: number,
	): Promise<boolean> {
		try {
			const confRes = await fetch("/api/system/getConf", {
				method: "POST",
				body: "{}",
			});
			const confJson = await confRes.json();
			if (confJson.code !== 0 || !confJson.data?.appearance) return false;
			const app = { ...confJson.data.appearance };
			if (mode === 0) app.themeLight = themeDir;
			else app.themeDark = themeDir;
			app.mode = mode;

			const res = await fetch("/api/setting/setAppearance", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ appearance: app }),
			});
			const json = await res.json();
			return json.code === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Install a plugin from the SiYuan marketplace by its name.
	 * Looks the package up in the bazaar, then triggers the official installer.
	 */
	public async installPlugin(pluginName: string): Promise<boolean> {
		try {
			const listRes = await fetch("/api/bazaar/getBazaarPlugin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ frontend: "all", keyword: pluginName }),
			});
			const listJson = await listRes.json();
			if (listJson.code !== 0 || !listJson.data?.packages) return false;

			const pkg = listJson.data.packages.find(
				(p: BazaarPackage) => p.name === pluginName,
			);
			if (!pkg) return false;

			const installRes = await fetch("/api/bazaar/installBazaarPlugin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					repoURL: pkg.repoURL,
					repoHash: pkg.repoHash,
					packageName: pkg.name,
					frontend: "all",
				}),
			});
			const installJson = await installRes.json();
			return installJson.code === 0;
		} catch {
			return false;
		}
	}

	/** Install a widget from the SiYuan marketplace by its name. */
	public async installWidget(widgetName: string): Promise<boolean> {
		try {
			const listRes = await fetch("/api/bazaar/getBazaarWidget", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ keyword: widgetName }),
			});
			const listJson = await listRes.json();
			if (listJson.code !== 0 || !listJson.data?.packages) return false;

			const pkg = listJson.data.packages.find(
				(p: BazaarPackage) => p.name === widgetName,
			);
			if (!pkg) return false;

			const installRes = await fetch("/api/bazaar/installBazaarWidget", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					repoURL: pkg.repoURL,
					repoHash: pkg.repoHash,
					packageName: pkg.name,
				}),
			});
			const installJson = await installRes.json();
			return installJson.code === 0;
		} catch {
			return false;
		}
	}

	/** Install a theme from the SiYuan marketplace by its name. */
	public async installTheme(themeName: string, mode = 0): Promise<boolean> {
		try {
			const listRes = await fetch("/api/bazaar/getBazaarTheme", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ keyword: themeName }),
			});
			const listJson = await listRes.json();
			if (listJson.code !== 0 || !listJson.data?.packages) return false;

			const pkg = listJson.data.packages.find(
				(p: BazaarPackage) => p.name === themeName,
			);
			if (!pkg) return false;

			const installRes = await fetch("/api/bazaar/installBazaarTheme", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					repoURL: pkg.repoURL,
					repoHash: pkg.repoHash,
					packageName: pkg.name,
					mode,
				}),
			});
			const installJson = await installRes.json();
			return installJson.code === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Recursively walk a workspace directory and build the list of files to sync.
	 */
	public async collectDir(
		siBase: string,
		ghBase: string,
	): Promise<FileToSync[]> {
		const entries = await this.readDir(siBase);
		const files: FileToSync[] = [];

		for (const e of entries) {
			const sp = siBase === "/" ? `/${e.name}` : `${siBase}/${e.name}`;
			const gp = ghBase ? `${ghBase}/${e.name}` : e.name;

			// Calculate the path relative to SYNC_ROOT (e.g. "storage" or "storage/av")
			const relPath = gp.startsWith(`${SYNC_ROOT}/`)
				? gp.slice(SYNC_ROOT.length + 1)
				: e.name;

                        // recent-doc.json participates in sync (merge-based)
                        if (relPath !== "storage/recent-doc.json" &&
                        	!/\/\.siyuan\/conf\.json$/.test(relPath) &&
                        	shouldSkipPath(relPath, SKIP_ROOT_DIRS)) continue;
                        if (SKIP_PATH_FRAGMENTS.some((f) => sp.includes(f))) continue;
                        if (LOCKED_EXTENSIONS.some((ext) => e.name.toLowerCase().endsWith(ext)))
                                continue;

                        // privacy-space integration: at the `data/<box>` level,
                        // skip any notebook marked locked in the registry.
                        if (
                                siBase === "/data" &&
                                this.privacyLocks &&
                                this.privacyLocks.has(e.name)
                        )
                                continue;

			if (e.isDir) {
				files.push(...(await this.collectDir(sp, gp)));
			} else {
				files.push({ siYuanPath: sp, githubPath: gp });
			}
		}
		return files;
	}

	/** Force SiYuan to rebuild its internal SQL database index. */
	public async rebuildDataIndex(): Promise<boolean> {
		try {
			const res = await fetch("/api/system/rebuildDataIndex", {
				method: "POST",
				body: "{}",
			});
			const json = await res.json();
			return json.code === 0;
		} catch {
			return false;
		}
	}
}