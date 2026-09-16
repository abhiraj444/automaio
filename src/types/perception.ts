export interface A11yNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  keyshortcuts?: string;
  roledescription?: string;
  valuetext?: string;
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  modal?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  level?: number;
  valuemin?: number;
  valuemax?: number;
  autocomplete?: string;
  haspopup?: string;
  invalid?: string;
  orientation?: string;
  children?: A11yNode[];
}

export interface PrunedElement {
  id: number; // e.g. [17]
  tag: string;
  role?: string;
  text?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  selector: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PrunedDOMSnapshot {
  url: string;
  title: string;
  elements: PrunedElement[];
  representationText: string;
  tokenEstimate: number;
}
