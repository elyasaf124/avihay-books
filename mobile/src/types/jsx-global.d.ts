import type * as React from "react";

/**
 * ב־`@types/react` 19 מרחב השמות `JSX` הוא תת־מרחב של `React` בלבד.
 * הקוד בפרויקט משתמש עדיין ב־`JSX.Element` כטיפוס החזרה — ממפים אותו ל־`React.JSX`.
 */
declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    interface ElementClass extends React.JSX.ElementClass {}
    interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    type ElementType = React.JSX.ElementType;
  }
}

export {};
