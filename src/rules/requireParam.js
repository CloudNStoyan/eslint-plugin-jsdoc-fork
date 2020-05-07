import iterateJsdoc from '../iterateJsdoc';

type T = [string, () => T];
const rootNamer = (desiredRoots: string[], currentIndex: number): T => {
  let name;
  let idx = currentIndex;
  if (desiredRoots.length > 1) {
    name = desiredRoots.shift();
  } else {
    const base = desiredRoots[0];
    const suffix = idx++;
    name = `${base}${suffix}`;
  }

  return [name, () => {
    return rootNamer(desiredRoots, idx);
  }];
};

export default iterateJsdoc(({
  jsdoc,
  node,
  utils,
  context,
}) => {
  const functionParameterNames = utils.getFunctionParameterNames();
  const preferredTagName = utils.getPreferredTagName({tagName: 'param'});
  if (!preferredTagName) {
    return;
  }
  const jsdocParameterNames = utils.getJsdocTagsDeep(preferredTagName);

  const shallowJsdocParameterNames = jsdocParameterNames.filter((tag) => {
    return !tag.name.includes('.');
  }).map((tag, idx) => {
    return {...tag,
      idx};
  });

  if (utils.avoidDocs()) {
    return;
  }

  // Param type is specified by type in @type
  if (utils.hasTag('type')) {
    return;
  }

  const {enableFixer = true} = context.options[0] || {};

  const missingTags = [];
  const flattenedRoots = utils.flattenRoots(functionParameterNames);
  const paramIndex = flattenedRoots.reduce((acc, cur, idx) => {
    acc[cur] = idx;

    return acc;
  }, {});

  const findExpectedIndex = (jsdocTags, indexAtFunctionParams) => {
    const remainingRoots = functionParameterNames.slice(indexAtFunctionParams || 0);
    const foundIndex = jsdocTags.findIndex(({name, newAdd}) => {
      return !newAdd && remainingRoots.some((remainingRoot) => {
        return Array.isArray(remainingRoot) ?
          remainingRoot[1].includes(name) :
          name === remainingRoot;
      });
    });

    if (foundIndex > -1) {
      return foundIndex;
    }

    const paramTags = jsdocTags.filter(({tag}) => {
      return tag === preferredTagName;
    });

    return paramTags.length;
  };

  const {
    autoIncrementBase = 0,
    unnamedRootBase = ['root'],
  } = context.options[0] || {};
  let [nextRootName, namer] = rootNamer([...unnamedRootBase], autoIncrementBase);

  functionParameterNames.forEach((functionParameterName, functionParameterIdx) => {
    if (Array.isArray(functionParameterName)) {
      const matchedJsdoc = shallowJsdocParameterNames[functionParameterIdx] ||
        jsdocParameterNames[functionParameterIdx];

      let rootName = nextRootName;
      [nextRootName, namer] = namer();
      if (functionParameterName[0]) {
        rootName = functionParameterName[0];
      } else if (matchedJsdoc && matchedJsdoc.name) {
        rootName = matchedJsdoc.name;
      }

      functionParameterName[1].forEach((paramName) => {
        if (jsdocParameterNames && !jsdocParameterNames.find(({name}) => {
          return name === rootName;
        })) {
          if (!missingTags.find(({functionParameterName: fpn}) => {
            return fpn === rootName;
          })) {
            const emptyParamIdx = jsdocParameterNames.findIndex(({name}) => {
              return !name;
            });

            if (emptyParamIdx > -1) {
              missingTags.push({
                functionParameterIdx: emptyParamIdx,
                functionParameterName: rootName,
                remove: true,
              });
            } else {
              missingTags.push({
                functionParameterIdx: paramIndex[rootName],
                functionParameterName: rootName,
              });
            }
          }
        }

        const fullParamName = `${rootName}.${paramName}`;

        if (jsdocParameterNames && !jsdocParameterNames.find(({name}) => {
          return name === fullParamName;
        })) {
          missingTags.push({
            functionParameterIdx: paramIndex[functionParameterName[0] ? fullParamName : paramName],
            functionParameterName: fullParamName,
          });
        }
      });

      return;
    }

    if (jsdocParameterNames && !jsdocParameterNames.find(({name}) => {
      return name === functionParameterName;
    })) {
      missingTags.push({
        functionParameterIdx: paramIndex[functionParameterName],
        functionParameterName,
      });
    }
  });

  const fixAll = (missings, tags) => {
    missings.forEach(({
      functionParameterIdx, functionParameterName, remove,
    }) => {
      if (remove) {
        tags.splice(functionParameterIdx, 1, {
          name: functionParameterName,
          newAdd: true,
          tag: preferredTagName,
        });
      } else {
        const expectedIdx = findExpectedIndex(tags, functionParameterIdx);
        tags.splice(expectedIdx, 0, {
          name: functionParameterName,
          newAdd: true,
          tag: preferredTagName,
        });
      }
    });
  };

  missingTags.forEach(({functionParameterName}, index) => {
    // Fix all missing tags the first time.
    const fixer = index > 0 ? null : () => {
      if (!jsdoc.tags) {
        jsdoc.tags = [];
      }

      fixAll(missingTags, jsdoc.tags);
    };
    utils.reportJSDoc(`Missing JSDoc @${preferredTagName} "${functionParameterName}" declaration.`, null, enableFixer ? fixer : null, node);
  });
}, {
  contextDefaults: true,
  meta: {
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          autoIncrementBase: {
            default: 0,
            type: 'integer',
          },
          checkConstructors: {
            default: true,
            type: 'boolean',
          },
          checkGetters: {
            default: false,
            type: 'boolean',
          },
          checkSetters: {
            default: false,
            type: 'boolean',
          },
          contexts: {
            items: {
              type: 'string',
            },
            type: 'array',
          },
          enableFixer: {
            type: 'boolean',
          },
          exemptedBy: {
            items: {
              type: 'string',
            },
            type: 'array',
          },
          unnamedRootBase: {
            items: {
              type: 'string',
            },
            type: 'array',
          },
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
});
