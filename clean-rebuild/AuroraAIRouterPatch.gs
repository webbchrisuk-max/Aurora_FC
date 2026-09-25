/* Aurora City FC — Conversational AI router integration
 *
 * Apply these three changes to the existing Final Consolidated Backend Router.
 *
 * 1) Release bump:
 *    A2_BACKEND_RELEASE = 'AURORA_DATA2_CONSOLIDATED_BACKEND_V2_3_AI'
 *    A2_BACKEND_ROUTER_VERSION = 2.3
 *    A2_BACKEND_RELEASED_AT = '2026-09-25'
 *
 * 2) Add this action object inside auroraActionSpecs_().
 *
 * {
 *   name:'aiChat',
 *   group:'AI',
 *   mode:'WRITE_DERIVED',
 *   handler:p => auroraHandleAiChat_(p)
 * },
 *
 * WRITE_DERIVED is intentional:
 * - aiChat must use POST because it carries message/context/history.
 * - The handler does not mutate AuroraData 2.
 * - GET remains read-only.
 * - Existing ARD2_verifyToken_ authentication runs before the handler.
 *
 * 3) Add this dependency group inside auroraBackendDependencies_().
 *
 * ai:{
 *   chat:
 *     typeof auroraHandleAiChat_ === 'function'
 * }
 *
 * No doGet() or doPost() rewrite is required.
 * The existing registry, POST mode gate, platform status and self-test
 * automatically pick up the AI action/dependency after those additions.
 */

function auroraAiRouterPatchStatus_() {
  const registry = auroraBuildActionRegistry_();
  const spec = registry.aiChat || null;

  return {
    ok:
      !!spec &&
      spec.group === 'AI' &&
      spec.mode === 'WRITE_DERIVED' &&
      typeof auroraHandleAiChat_ === 'function',
    actionRegistered: !!spec,
    group: spec ? spec.group : null,
    mode: spec ? spec.mode : null,
    handlerAvailable:
      typeof auroraHandleAiChat_ === 'function',
    at: new Date().toISOString()
  };
}
