import PropTypes from 'prop-types'
import React from 'react'

import { childrenExist, createShorthandFactory, customPropTypes, UIComponent } from '../../lib'

import labelRules from './labelRules'
import labelVariables from './labelVariables'

/**
 * A label displays content classification
 */
class Label extends UIComponent<any, any> {
  static className = 'ui-label'

  static propTypes = {
    /** An element type to render as (string or function). */
    as: customPropTypes.as,

    /** Primary content. */
    children: PropTypes.node,

    /** A label can be circular. */
    circular: PropTypes.bool,

    /** Additional classes. */
    className: PropTypes.string,

    /** Shorthand for primary content. */
    content: customPropTypes.contentShorthand,

    styles: PropTypes.object,
  }

  static handledProps = ['as', 'children', 'circular', 'className', 'content', 'styles']

  static defaultProps = {
    as: 'label',
  }

  static rules = labelRules

  static variables = labelVariables

  renderComponent({ ElementType, classes, rest }) {
    const { children, content } = this.props
    return (
      <ElementType {...rest} className={classes.root}>
        {childrenExist(children) ? children : content}
      </ElementType>
    )
  }
}

Label.create = createShorthandFactory(Label, content => ({ content }))

export default Label
