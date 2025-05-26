import * as React from 'react';

import { AugmodViewProps } from './Augmod.types';

export default function AugmodView(props: AugmodViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
