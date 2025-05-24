import { registerWebModule, NativeModule } from 'expo';

import { AugmodModuleEvents } from './Augmod.types';

class AugmodModule extends NativeModule<AugmodModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(AugmodModule, 'AugmodModule');
