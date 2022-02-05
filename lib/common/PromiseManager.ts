const timedOutMessage: string = "Timed out";

export interface PromiseData<T> {
	resolve(val: T | PromiseLike<T>): void
	reject(reason?: any): void
}

export class PromiseManger {
	private promiseData: {[uri: string]: PromiseData<any>} = {};
	
	createPromise<Type>(uri: string, timeout: number = 10): Promise<Type> {
        return new Promise<Type>((resolve, reject) => {
            this.promiseData[uri] = {
                resolve: resolve,
                reject: reject
            };

            if (timeout) {
                setTimeout(() => reject(timedOutMessage), timeout * 1000);
            } 
        });
    }

    resolvePromise<Type>(uri: string, data: Type): void {
        if (uri in this.promiseData) {
            this.promiseData[uri].resolve(data);
            delete this.promiseData[uri];
        }
    }

    rejectPromise<Type>(uri: string, data: Type): void {
        if (uri in this.promiseData) {
            this.promiseData[uri].reject(data);
            delete this.promiseData[uri];
        }
    }

    reset() {
        for (const val of Object.values(this.promiseData)) {
            val.reject();
        }
        this.promiseData = {};
    }
}
