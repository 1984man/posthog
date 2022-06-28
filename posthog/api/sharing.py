import json
from typing import Any, Dict, Optional, Tuple, cast

from django.core.serializers.json import DjangoJSONEncoder
from django.views.decorators.clickjacking import xframe_options_exempt
from rest_framework import mixins, response, serializers, viewsets
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from posthog.api.dashboard import DashboardSerializer
from posthog.api.insight import InsightSerializer
from posthog.api.routing import StructuredViewSetMixin
from posthog.models import SharingConfiguration
from posthog.models.dashboard import Dashboard
from posthog.models.exported_asset import ExportedAsset, asset_for_token, get_content_response
from posthog.models.insight import Insight
from posthog.permissions import TeamMemberAccessPermission
from posthog.utils import render_template


class SharingConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SharingConfiguration
        fields = ["created_at", "enabled", "access_token"]
        read_only_fields = ["created_at", "access_token"]


class SharingConfigurationViewSet(
    StructuredViewSetMixin, mixins.ListModelMixin, viewsets.GenericViewSet, mixins.UpdateModelMixin,
):
    permission_classes = [IsAuthenticated, TeamMemberAccessPermission]
    pagination_class = None
    queryset = SharingConfiguration.objects.select_related("dashboard", "insight")
    serializer_class = SharingConfigurationSerializer
    include_in_docs = False

    def get_serializer_context(self) -> Dict[str, Any]:
        context = super().get_serializer_context()

        dashboard_id = context.get("dashboard_id")
        insight_id = context.get("insight_id")

        if not dashboard_id and not insight_id:
            raise ValidationError("Either a dashboard or insight must be specified")

        if dashboard_id:
            try:
                context["dashboard"] = Dashboard.objects.get(id=dashboard_id)
            except Dashboard.DoesNotExist:
                raise NotFound("Dashboard not found.")
        if insight_id:
            try:
                context["insight"] = Insight.objects.get(id=insight_id)
            except Insight.DoesNotExist:
                raise NotFound("Insight not found.")

        return context

    def list(self, request: Request, *args: Any, **kwargs: Any) -> response.Response:
        context = self.get_serializer_context()
        instance = self._get_sharing_configuration()

        serializer = self.get_serializer(instance, context)
        serializer.is_valid(raise_exception=True)

        return response.Response(serializer.data)

    def patch(self, request: Request, *args: Any, **kwargs: Any) -> response.Response:
        instance = self._get_sharing_configuration()

        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return response.Response(serializer.data)

    def _get_sharing_configuration(self):
        context = self.get_serializer_context()

        instance, created = SharingConfiguration.objects.get_or_create(
            insight_id=context.get("insight_id"), dashboard_id=context.get("dashboard_id"), team_id=self.team_id
        )
        instance = cast(SharingConfiguration, instance)
        dashboard = cast(Optional[Dashboard], context.get("dashboard"))
        if dashboard:
            # Ensure the legacy dashboard fields are in sync with the sharing configuration
            if dashboard.share_token and dashboard.share_token != instance.access_token:
                instance.enabled = dashboard.is_shared
                instance.access_token = dashboard.share_token
                instance.save()

        return instance


class SharingViewerPageViewSet(mixins.RetrieveModelMixin, StructuredViewSetMixin, viewsets.GenericViewSet):
    authentication_classes = []  # type: ignore
    permission_classes = []  # type: ignore

    def get_object(self) -> Tuple[Optional[SharingConfiguration], Optional[ExportedAsset]]:
        # JWT based access (ExportedAsset)
        token = self.request.query_params.get("token")
        if token:
            asset = asset_for_token(token)
            if asset:
                return (None, asset)

        # Path based access (SharingConfiguration only)
        access_token = self.kwargs.get("access_token")
        if access_token:
            sharing_configuration = SharingConfiguration.objects.select_related("dashboard", "insight").get(
                access_token=access_token
            )

            if sharing_configuration and sharing_configuration.enabled:
                return (sharing_configuration, None)

        return (None, None)

    @xframe_options_exempt
    def retrieve(self, request: Request, *args: Any, **kwargs: Any) -> Any:
        sharing_configuration, asset = self.get_object()

        resource = sharing_configuration or asset
        if not resource:
            raise NotFound()

        context = {"view": self, "request": request}
        exported_data: Dict[str, Any] = {"type": "embed" if "embedded" in request.GET else "scene"}

        if asset:
            if request.path.endswith(f".{asset.file_ext}"):
                if not asset.content:
                    raise serializers.NotFound()

                return get_content_response(asset, request.query_params.get("download") == "true")

            exported_data["type"] = "image"

        if resource.insight:
            insight_data = InsightSerializer(resource.insight, many=False, context=context).data
            exported_data.update({"insight": insight_data})
        elif resource.dashboard:
            dashboard_data = DashboardSerializer(resource.dashboard, context=context).data
            # We don't want the dashboard to be accidentally loaded via the shared endpoint
            dashboard_data["share_token"] = None
            exported_data.update({"dashboard": dashboard_data})
        else:
            raise NotFound()

        if "whitelabel" in request.GET and "white_labelling" in resource.team.organization.available_features:
            exported_data.update({"whitelabel": True})
        if "noLegend" in request.GET:
            exported_data.update({"noLegend": True})

        return render_template(
            "exporter.html",
            request=request,
            context={"exported_data": json.dumps(exported_data, cls=DjangoJSONEncoder)},
        )
