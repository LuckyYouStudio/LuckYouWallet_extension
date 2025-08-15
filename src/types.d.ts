// Chrome Extension API 类型声明
declare namespace chrome {
  export namespace runtime {
    export function getURL(path: string): string;
    export function sendMessage(message: any): Promise<any>;
    export function onMessage: {
      addListener(callback: (message: any, sender: any, sendResponse: any) => void): void;
    };
  }
  
  export namespace storage {
    export namespace local {
      export function get(keys?: string | object | string[] | null): Promise<{ [key: string]: any }>;
      export function set(items: object): Promise<void>;
      export function remove(keys: string | string[]): Promise<void>;
      export function clear(): Promise<void>;
    }
  }
  
  export namespace tabs {
    export function query(queryInfo: any): Promise<any[]>;
    export function sendMessage(tabId: number, message: any): Promise<any>;
    export function get(tabId: number): Promise<any>;
  }
  
  export namespace action {
    export function openPopup(): void;
  }
}

// 全局类型声明
declare global {
  interface Window {
    ethereum?: any;
    luckyouWallet?: any;
  }
}

export {};
