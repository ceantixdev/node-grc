import * as types from "../typesns";
import * as utils from "./utils";

type FolderRightsData = {
	folder: string,
	permissions: string,
	match: string
};

type FolderRightsMap = {[name: string]: FolderRightsData};

export class FolderRights {
	private folderRightsText: string = "";
	private folderRights: FolderRightsMap = {};

	public setFolderRights(rights: string) {
		const re = /^([r]?[w]?) (.*)\/(.*)$/gm;
		const matches = rights.matchAll(re);

		this.folderRightsText = "";
		this.folderRights = {};

		for (const match of matches) {
			let [, perm, folder, filematch] = match;

			this.folderRights[folder] = {
				folder: folder,
				permissions: perm,
				match: filematch
			};

			this.folderRightsText += folder + "\n";
		}
	}
	
	/**
	 * Get immediate subfolders based on the users folder rights
	 * 
	 * @param folder 
	 * @returns 
	 */
	 public getSubFolders(folder: string = ""): types.FSEntries[] {
		if (folder && !folder.endsWith("/")) {
			folder += "/";
		}

		const escapedFolder = utils.escapeRegExp(folder);
		const regex = new RegExp(`^${escapedFolder}([^\/\n]+)`, 'gm');
		const matches = this.folderRightsText.matchAll(regex);

		const entries: {[key: string]: types.FSEntries} = {};

		for (const match of matches) {
			const curFolder = match[1];

			if (!(curFolder in entries)) {
				const folderPath = folder + curFolder;

				if (folderPath in this.folderRights) {
					entries[curFolder] = {
						name: curFolder,
						type: types.FSEntryType.Directory,
						permissions: this.folderRights[folderPath].permissions,
						fileSize: 0,
						modTime: 0
					};
				}
			}
		}

		return Object.values(entries);
	}
}