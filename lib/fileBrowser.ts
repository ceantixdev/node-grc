import { FSEntryType } from ".";
import { FolderRights } from "./common/FolderRights";
import { GBufferReader } from "./common/GBuffer";
import { PromiseManger } from "./common/PromiseManager";
import { RCOutgoingPacket } from "./misc/packet";
import { RemoteControl } from "./remoteControl";
import * as types from "./typesns";

export interface FileBrowser {
	cd(folder: string) : PromiseLike<types.DirectoryListing>;
	get(file: string) : PromiseLike<Buffer>;
	put(file: string, content: Buffer): void;
}

type FileStructure = {
	name: string,
	size: number,
	modTime: number,
	buffer: Buffer[]
};

type FileData = {[name: string]: FileStructure};

export class RCFileBrowser implements FileBrowser {
	private folderRights: FolderRights;
	private promiseMngr: PromiseManger;
	private fileData: FileData = {};
	private active: string = "";

	constructor(private readonly rc: RemoteControl) {
		this.folderRights = new FolderRights();
		this.promiseMngr = new PromiseManger();
	}

	/////////

	setFolderRights(content: string) {
		this.folderRights.setFolderRights(content);
	}

	setFolderFiles(reader: GBufferReader, folderName: string) {
		const dirList: types.DirectoryListing = {
			directory: folderName,
			fileList: this.folderRights.getSubFolders(folderName)
		};

		while (reader.bytesLeft) {
			reader.readUInt8(); 	// skip space

			const reader2 = reader.readGBuffer();
			dirList.fileList.push({
				name: reader2.readGString(),
				type: FSEntryType.File,
				permissions: reader2.readGString(),
				fileSize: reader2.readGULong(),
				modTime: reader2.readGULong()
			});
		}

		this.promiseMngr.resolvePromise("dir://" + folderName, dirList);
	}

	startLargeFile(fileName: string) {
		this.fileData[fileName] = {
			name: fileName,
			size: 0,
			modTime: 0,
			buffer: []
		};

		this.active = fileName;
	}

	setActiveFileSize(size: number) {
		if (this.active in this.fileData) {
			this.fileData[this.active].size = size;
		}
	}

	appendFileContent(fileName: string, modTime: number, buffer: Buffer) {
		if (fileName in this.fileData) {
			this.fileData[fileName].modTime = modTime;
			this.fileData[fileName].buffer.push(buffer);
			return;
		}

		this.startLargeFile(fileName);
		this.setActiveFileSize(buffer.length);

		this.fileData[fileName].modTime = modTime;
		this.fileData[fileName].buffer.push(buffer);

		this.finishLargeFile(fileName);
	}

	finishLargeFile(fileName: string) {
		if (fileName in this.fileData) {
			this.promiseMngr.resolvePromise(fileName, Buffer.concat(this.fileData[fileName].buffer));
			delete this.fileData[fileName];
		}

		if (fileName == this.active) {
			this.active = "";
		}
	}

	fileDownloadFailed(fileName: string) {
		if (fileName in this.fileData) {
			this.promiseMngr.rejectPromise(fileName, "File download failed");
			delete this.fileData[fileName];
		}

		if (fileName == this.active) {
			this.active = "";
		}
	}

	////////////////////

	cd(folder: string): Promise<types.DirectoryListing> {
		if (!folder) {			
			return new Promise((resolve) => {
				resolve({
					directory: "/",
					fileList: this.folderRights.getSubFolders()
				});
			});
		}

		if (!folder.endsWith("/")) {
			folder += "/";
		}

		this.rc.socket?.sendData(this.rc.socket?.sendPacket(RCOutgoingPacket.PLI_RC_FILEBROWSER_CD, Buffer.from(folder)));
		console.log("create promise: " + "dir://" + folder);
		return this.promiseMngr.createPromise("dir://" + folder);
	}

	put(file: string, content: Buffer): void {
		throw new Error("Method not implemented.");
	}
	
	get(fileName: string) : PromiseLike<Buffer> {
		this.rc.socket?.sendData(this.rc.socket?.sendPacket(RCOutgoingPacket.PLI_RC_FILEBROWSER_DOWN, Buffer.from(fileName)));

		return this.promiseMngr.createPromise(fileName);
	}
}