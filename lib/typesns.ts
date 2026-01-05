import { NPC } from "./misc/npcs";

export enum ServerCategory {
	classic = 0,
	gold = 1,
	hosted = 2,
	hidden = 3,
	g3d = 4
}

export interface ServerEntry {
	name: string
	category: ServerCategory
	language: string
	description: string
	url: string
	version: string
	pcount: number
	ip: string
	port: number
}

export interface ServerlistConfig {
	host: string
	port: number
	account: string
	password: string
	nickname: string
}

export interface RCEvents {
	onRCConnected?(instance: RCInterface): void
	onRCDisconnected?(instance: RCInterface, text?: string): void
	onRCChat?(text: string): void
	onFileBrowserMsg?(text: string): void
}

export interface RCInterface {
	get maxUploadFileSize(): number

	sendRCChat(text: string): void
	setNickName(name: string): void

	requestFolderConfig(): Promise<string>
	requestServerFlags(): Promise<string>
	requestServerOptions(): Promise<string>

	setFolderConfig(text: string): void
	setServerFlags(text: string): void
	setServerOptions(text: string): void
}


export interface NCEvents {
	onNCConnected?(): void
	onNCDisconnected?(text?: string): void
	onNCChat?(text: string): void

	onNpcAdded?(name: string): void
	onNpcDeleted?(name: string): void
}

export interface NCInterface {
	get classes(): Set<string>;
	get npcs(): NPC[]

	requestLevelList(): Promise<string>

	deleteWeapon(name: string): void
	requestWeaponList(): Promise<Set<string>>
	requestWeapon(name: string): Promise<[string, string]>
	setWeaponScript(name: string, image: string, script: string): void

	deleteNpc(name: string): void
	requestNpcAttributes(name: string): Promise<string>
	requestNpcFlags(name: string): Promise<string>
	requestNpcScript(name: string): Promise<string>
	setNpcFlags(name: string, script: string): void
	setNpcScript(name: string, script: string): void

	deleteClass(name: string): Promise<void>
	requestClass(name: string): Promise<string>
	setClassScript(name: string, script: string): Promise<void>
}

export enum FSEntryType {
	File,
	Directory
}

export interface FSEntries {
	name: string,
	type: FSEntryType,
	permissions: string,
	fileSize: number,
	modTime: number
}

export type DirectoryListing = {
	directory: string,
	fileList: FSEntries[]
};