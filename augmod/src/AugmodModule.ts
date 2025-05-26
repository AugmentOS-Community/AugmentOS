import { NativeModule, requireNativeModule } from 'expo';

import { AugmodModuleEvents } from './Augmod.types';

declare class AugmodModule extends NativeModule<AugmodModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<AugmodModule>('Augmod');
